"""Declarative formula evaluator for derived asset sensors.

Formulas are Python-like expressions over sibling entity slugs, e.g.

    oil_change_date - now()

Supported features:
  - arithmetic: + - * / %
  - comparisons: == != < <= > >=
  - boolean: and or not
  - parentheses
  - calls to a small whitelist of functions: now, days, datediff, abs,
    min, max, round
  - names resolved to sibling entity values (by slug) or to literals

The evaluator is a hand-rolled recursive-descent parser over the
`tokenize` stdlib tokenizer — deliberately small, no `eval`, no imports.
Only a whitelisted AST node set is accepted; anything else raises
`FormulaSyntaxError`.
"""

from __future__ import annotations

import ast
import tokenize
from collections.abc import Callable
from datetime import date, timedelta
from io import StringIO
from typing import Any, ClassVar

__all__ = ["FormulaSyntaxError", "evaluate_formula", "referenced_names"]

_FUNCS: dict[str, Callable[..., Any]] = {
    "now": lambda: date.today(),
    "days": lambda a, b: (a - b).days if hasattr(a, "days") else (a - b),
    "datediff": lambda a, b: (a - b).days,
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
}

_ALLOWED_OPS = {
    tokenize.OP: {"+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">="},
}
_KEYWORDS = {"and", "or", "not", "True", "False", "None"}


class FormulaSyntaxError(ValueError):
    """Raised when a formula cannot be parsed or evaluated."""


def referenced_names(formula: str) -> set[str]:
    """Return the set of bare names referenced by the formula.

    Excludes function-call heads and Python keywords. These are the
    sibling entity slugs the derived sensor depends on.
    """
    tokens = _tokenize(formula)
    names: set[str] = set()
    for i, tok in enumerate(tokens):
        if tok.type != tokenize.NAME:
            continue
        if tok.string in _KEYWORDS:
            continue
        if tok.string in _FUNCS:
            continue
        next_tok = tokens[i + 1] if i + 1 < len(tokens) else None
        if next_tok is not None and next_tok.type == tokenize.OP and next_tok.string == "(":
            continue
        names.add(tok.string)
    return names


def evaluate_formula(formula: str, variables: dict[str, Any]) -> Any:
    """Evaluate a formula string against the supplied variables.

    `variables` maps sibling-entity slug -> current value (already typed).
    Raises `FormulaSyntaxError` on any parse/eval failure.
    """
    tokens = _tokenize(formula)
    if not tokens:
        raise FormulaSyntaxError("empty formula")
    parser = _Parser(tokens, variables)
    result = parser.parse_expression()
    parser.expect_end()
    return result


def _tokenize(formula: str) -> list[tokenize.TokenInfo]:
    try:
        return [
            t
            for t in tokenize.generate_tokens(StringIO(formula).readline)
            if t.type
            not in (tokenize.NEWLINE, tokenize.NL, tokenize.ENCODING, tokenize.ENDMARKER)
        ]
    except tokenize.TokenError as err:
        raise FormulaSyntaxError(str(err)) from err


class _Parser:
    """Recursive-descent parser with precedence climbing."""

    _PRECEDENCE: ClassVar[dict[str, int]] = {
        "or": 1,
        "and": 2,
        "==": 3,
        "!=": 3,
        "<": 4,
        "<=": 4,
        ">": 4,
        ">=": 4,
        "+": 5,
        "-": 5,
        "%": 6,
        "*": 7,
        "/": 7,
    }

    def __init__(self, tokens: list[tokenize.TokenInfo], variables: dict[str, Any]) -> None:
        self._tokens = tokens
        self._pos = 0
        self._vars = variables

    @property
    def _cur(self) -> tokenize.TokenInfo | None:
        return self._tokens[self._pos] if self._pos < len(self._tokens) else None

    def expect_end(self) -> None:
        if self._cur is not None:
            raise FormulaSyntaxError(f"unexpected token {self._cur.string!r}")

    def _advance(self) -> tokenize.TokenInfo | None:
        tok = self._cur
        self._pos += 1
        return tok

    def parse_expression(self) -> Any:
        return self._parse_binary(0)

    def _parse_binary(self, min_prec: int) -> Any:
        left = self._parse_unary()
        while True:
            tok = self._cur
            if tok is None:
                break
            op = tok.string if tok.type == tokenize.OP or tok.type == tokenize.NAME else None
            if op not in self._PRECEDENCE:
                break
            prec = self._PRECEDENCE[op]
            if prec < min_prec:
                break
            self._advance()
            right = self._parse_binary(prec + 1)
            left = self._apply_op(op, left, right)
        return left

    def _parse_unary(self) -> Any:
        tok = self._cur
        if tok is not None and tok.type == tokenize.OP and tok.string in ("+", "-"):
            self._advance()
            operand = self._parse_unary()
            if tok.string == "-":
                return -operand
            return operand
        if tok is not None and tok.type == tokenize.NAME and tok.string == "not":
            self._advance()
            return not self._parse_unary()
        return self._parse_primary()

    def _parse_primary(self) -> Any:
        tok = self._cur
        if tok is None:
            raise FormulaSyntaxError("unexpected end of formula")
        if tok.type == tokenize.OP and tok.string == "(":
            self._advance()
            result = self.parse_expression()
            close = self._cur
            if close is None or close.string != ")":
                raise FormulaSyntaxError("missing closing parenthesis")
            self._advance()
            return result
        if tok.type == tokenize.NAME:
            return self._parse_name()
        if tok.type == tokenize.NUMBER:
            self._advance()
            return self._parse_number(tok.string)
        if tok.type == tokenize.STRING:
            self._advance()
            return _parse_string_literal(tok.string)
        raise FormulaSyntaxError(f"unexpected token {tok.string!r}")

    def _parse_name(self) -> Any:
        tok = self._cur
        assert tok is not None
        name = tok.string
        self._advance()
        nxt = self._cur
        if nxt is not None and nxt.type == tokenize.OP and nxt.string == "(":
            return self._parse_call(name)
        if name == "True":
            return True
        if name == "False":
            return False
        if name == "None":
            return None
        if name in self._vars:
            return self._vars[name]
        raise FormulaSyntaxError(f"unknown name {name!r}")

    def _parse_call(self, name: str) -> Any:
        open_tok = self._cur
        assert open_tok is not None and open_tok.string == "("
        self._advance()
        args: list[Any] = []
        if self._cur is not None and not (
            self._cur.type == tokenize.OP and self._cur.string == ")"
        ):
            args.append(self.parse_expression())
            while self._cur is not None and self._cur.string == ",":
                self._advance()
                args.append(self.parse_expression())
        close = self._cur
        if close is None or close.string != ")":
            raise FormulaSyntaxError(f"missing ) in call to {name}")
        self._advance()
        if name not in _FUNCS:
            raise FormulaSyntaxError(f"unknown function {name!r}")
        try:
            return _FUNCS[name](*args)
        except (TypeError, ValueError) as err:
            raise FormulaSyntaxError(str(err)) from err

    @staticmethod
    def _parse_number(token: str) -> Any:
        if "." in token or "e" in token or "E" in token:
            return float(token)
        return int(token)

    @staticmethod
    def _apply_op(op: str, left: Any, right: Any) -> Any:
        if op in ("and", "or"):
            if op == "and":
                return left and right
            return left or right
        if left is None or right is None:
            return None
        try:
            if op == "+":
                return left + right
            if op == "-":
                result = left - right
                if isinstance(result, timedelta):
                    return result.days
                return result
            if op == "*":
                return left * right
            if op == "/":
                return left / right
            if op == "%":
                return left % right
            if op == "==":
                return left == right
            if op == "!=":
                return left != right
            if op == "<":
                return left < right
            if op == "<=":
                return left <= right
            if op == ">":
                return left > right
            if op == ">=":
                return left >= right
        except TypeError as err:
            raise FormulaSyntaxError(str(err)) from err
        raise FormulaSyntaxError(f"unsupported operator {op!r}")


def _parse_string_literal(token: str) -> str:
    try:
        value = ast.literal_eval(token)
    except (ValueError, SyntaxError) as err:
        raise FormulaSyntaxError(f"invalid string literal {token!r}") from err
    if not isinstance(value, str):
        raise FormulaSyntaxError(f"expected string literal, got {type(value).__name__}")
    return value

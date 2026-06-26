FROM mcr.microsoft.com/devcontainers/python:3.14

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONASYNCIODEBUG=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      libudev-dev \
      git \
      ffmpeg \
      tzdata \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONPATH=/workspaces/homeassistant-asset-manager

USER vscode
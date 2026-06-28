"""Constants for the Asset Manager integration."""

DOMAIN = "asset_manager"

STORAGE_VERSION = 1
SAVE_DELAY = 10

ASSET_STORAGE_KEY = f"{DOMAIN}/assets"
ENTITY_STORAGE_KEY = f"{DOMAIN}/entities"
TEMPLATE_STORAGE_KEY = f"{DOMAIN}/templates"

PLATFORMS: tuple[str, ...] = (
    "number",
    "sensor",
    "date",
    "text",
    "select",
    "button",
    "switch",
)

CONF_LABELS = "labels"
CONF_APPLY_LABELS = "apply_labels"

DATA_ADDERS = "entity_adders"
DATA_COORDINATOR = "coordinator"

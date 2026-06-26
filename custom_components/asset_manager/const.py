"""Constants for the Asset Manager integration."""

DOMAIN = "asset_manager"

STORAGE_VERSION = 1
SAVE_DELAY = 10

ASSET_STORAGE_KEY = f"{DOMAIN}/assets"
ENTITY_STORAGE_KEY = f"{DOMAIN}/entities"

PLATFORMS: tuple[str, ...] = (
    "number",
    "sensor",
    "date",
    "text",
    "select",
    "button",
    "switch",
)

DATA_ADDERS = "entity_adders"
DATA_COORDINATOR = "coordinator"

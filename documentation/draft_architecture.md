I think this is actually a gap in the Home Assistant ecosystem. There are solutions for **maintenance scheduling**, but I couldn't find one that treats arbitrary physical objects ("assets") as first-class Home Assistant devices that you manage entirely from the UI.

## What you're really describing

Not just "vehicle maintenance", but an **Asset Management integration**.

Example assets:

* 🚗 Car
* 🚲 Bicycle
* 🖨 Printer
* ☕ Coffee machine
* 🚰 Water filter
* 🏠 HVAC
* 🔋 UPS
* 🔧 Lawn mower
* 🛠 Power drill
* 🧹 Robot vacuum consumables
* 🏕 Camping equipment

Each asset becomes a Home Assistant **Device** with manually maintained entities.

Example:

```
Vehicle: Volvo XC60

Entities:
- Odometer (number)
- Engine hours
- Last oil change date
- Oil change mileage
- Next oil change due
- Tire installation date
- Tire mileage
- Brake pads %
- Insurance expiration
- Registration expiration
- Notes
```

Or

```
Water Filter

Entities:
- Installation date
- Days installed
- Liters processed
- Remaining life
- Next replacement date
```

---

# What I'd build

Instead of "Vehicle Manager"

I'd build

# Asset Manager

Domain

```
asset_manager
```

or

```
manual_assets
```

---

Each Asset would be a Device.

```
Garage

  Vehicle A
  Bicycle
  Air Compressor
```

Each device has metadata

```
Manufacturer
Model
Serial
Purchase date
Purchase price
Category
Tags
Photo
Notes
```

---

## Then entities

Each asset can have any number of entities.

Examples

```
Number
```

Mileage

Hours

Cycles

Pressure

Capacity

Weight

Remaining %

---

```
Date
```

Installed

Purchased

Last serviced

Warranty expires

Inspection

---

```
Text
```

Notes

Part number

Supplier

VIN

Serial

---

```
Select
```

Condition

Excellent

Good

Needs Service

Broken

---

```
Boolean
```

Installed

Enabled

In storage

Needs replacement

---

```
Button

Reset filter

Replace oil

Service complete
```

which simply updates dates/counters.

---

# The killer feature

Templates.

Example:

Vehicle Template

```
Mileage
Oil change

Oil filter

Cabin filter

Air filter

Coolant

Brake fluid

Transmission fluid

Registration expiry

Insurance expiry
```

Create Vehicle

↓

Everything appears automatically.

---

Water Filter template

```
Installation date

Days installed

Liters

Remaining %

Replacement due
```

---

Coffee Machine

```
Last descaling

Water filter

Cleaning cycles

Shots made
```

---

UPS

```
Battery install

Runtime

Battery health

Replacement due
```

---

# Clone Device

This is probably the biggest usability improvement.

```
Vehicle Template

↓

Clone

↓

Name

Toyota Corolla

↓

Done
```

Creates 30 entities instantly.

---

# Smart derived sensors

Instead of only manual values.

Example

Manual:

```
Oil changed

2026-06-15
```

Computed

```
Days since oil change

11
```

Manual

```
Mileage

95,000
```

Computed

```
Mileage since oil change

7,200
```

Manual

```
Replace every

10,000
```

Computed

```
Remaining

2,800 km
```

No YAML.

---

# UI

I would avoid using Home Assistant Helpers altogether.

Instead:

```
Settings

Asset Manager
```

Assets

```
+ Add Asset

Vehicle

Water Filter

Printer

UPS

Custom
```

Click Asset

```
Information

Entities

History

Maintenance

Templates

Clone

Delete
```

---

Editing entities

```
+ Add Entity

Number

Date

Counter

Text

Boolean

Select
```

Entirely in UI.

---

# Automations become simple

```
Mileage > Next Service
```

Notify.

```
Warranty expires in 30 days
```

Notify.

```
Filter age > 180 days
```

Notify.

---

# Internal architecture

I would not use helpers internally.

Instead, store everything in the integration's own storage (`.storage`) and expose native Home Assistant entities. This aligns with how custom integrations register devices and entities. ([Home Assistant Developer Docs][3])

```
Config Entry

└── Assets

      Device

          NumberEntity

          SensorEntity

          DateEntity

          TextEntity

          SelectEntity

          ButtonEntity
```

Benefits:

* no helper clutter
* proper devices
* easy backups
* easy import/export
* fast cloning
* versionable schema

---

## My conclusion

I don't think an existing integration fully delivers what you're describing. The closest match today is Vehicle Service Manager for automotive maintenance, but it is intentionally specialized. ([Home Assistant Community][1])

A dedicated **Asset Manager** integration would fill a broader need by combining:

* **UI-managed assets** (devices)
* **Native Home Assistant entities** (numbers, dates, text, booleans, selects, buttons)
* **Templates** (Vehicle, HVAC, Water Filter, Appliance, Custom)
* **One-click cloning** of complete asset definitions
* **Derived sensors** (days since service, remaining mileage, warranty countdown)
* **Import/export** of templates and assets

I think this would feel like a native Home Assistant integration rather than a collection of helpers, and it would likely be useful well beyond vehicle tracking. It also appears to be a gap that isn't currently addressed by existing integrations.

[1]: https://community.home-assistant.io/t/vehicle-service-manager/1012193?utm_source=chatgpt.com "Vehicle-Service-Manager - Custom Integrations - Home Assistant Community"
[2]: https://developers.home-assistant.io/docs/device_registry_index/?utm_source=chatgpt.com "Device registry | Home Assistant Developer Docs"
[3]: https://developers.home-assistant.io/docs/architecture/devices-and-services/?utm_source=chatgpt.com "Entities: integrating devices & services | Home Assistant Developer Docs"

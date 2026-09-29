---
title: "Migrating from PocketMine-MP (PMMP)"
outline: deep
description: How to switch an existing PocketMine-MP (PMMP) server to Axolotl-PM, an actively maintained fork of PMMP. Covers plugin compatibility, worlds, configuration and the upgrade steps.
---

# Migrating from PocketMine-MP (PMMP)

PocketMine-MP (PMMP) is no longer maintained. The [pmmp/PocketMine-MP](https://github.com/pmmp/PocketMine-MP) repository was archived in July 2026, and its last release was 5.44.3.

Axolotl-PM is an actively maintained fork of PMMP. It continues from the last PMMP code and follows PMMP's [versioning policy](/docs/developers/plugin-docs/api-version-spec), starting at 5.45.0.

Most PMMP servers can switch to Axolotl-PM without changing their plugins, worlds or configuration.

## Compatibility

### Plugins

PMMP plugins are compatible with Axolotl-PM unless they use the network API.

Axolotl-PM keeps the `pocketmine\` namespaces, and the plugin loader and `plugin.yml` format are the same as in PMMP. The API version is the server version, so a plugin that declares `api: 5.0.0` loads on Axolotl-PM 5.x.

A plugin may need an update if it:

- creates or reads packets directly using the classes in `pocketmine\network\mcpe\protocol`
- uses other network internals under `pocketmine\network\mcpe`, such as the `cache`, `convert` or `handler` namespaces
- sets `mcpe-protocol` in its `plugin.yml`, since Axolotl-PM uses a newer protocol version than PMMP
- registers its own network interface with `Network::registerInterface()`, which is deprecated in favour of the new transport API

::: tip Tip
If a plugin fails to load, see [What does "Incompatible API version" mean when loading a plugin?](/docs/faq/plugins/incompatibleapi).
:::

### Worlds and server data

Axolotl-PM uses the same world format and the same data folder layout as PMMP. Your `worlds`, `players`, `plugin_data` and `resource_packs` folders, and files like `ops.txt` and `banned-players.txt`, work without conversion.

### Configuration

`server.properties` and `pocketmine.yml` work as they are. No settings were removed, and the only new section is `transport` for [NetherNet](#nethernet).

Axolotl-PM uses its own servers for crash reports, update checks and timings reports. New servers get these settings automatically, but an existing `pocketmine.yml` keeps the PMMP addresses. Change these three `host` settings in your `pocketmine.yml`:

```yaml
auto-report:
  host: crash.axolotl-pm.org

auto-updater:
  host: update.axolotl-pm.org

timings:
  host: timings.axolotl-pm.org
```

Only change the `host` lines; leave the other settings in each section as they are.

### NetherNet

Axolotl-PM supports [NetherNet](/docs/installation/nethernet-usage), the WebRTC-based transport that replaces RakNet in Minecraft: Bedrock Edition. PMMP only supports RakNet.

An existing `pocketmine.yml` has no `transport` section, so Axolotl-PM keeps using RakNet after you switch. To use NetherNet, add this to your `pocketmine.yml`:

```yaml
transport:
  name: nethernet
```

See [NetherNet Usage](/docs/installation/nethernet-usage) for the other settings and for setting up TLS.

::: warning Warning
NetherNet doesn't use the same ports as RakNet. It needs TCP port `19132` for signaling and UDP ports for game traffic. Update your firewall and port forwarding before you switch; see [Ports you need to open](/docs/installation/nethernet-usage#ports-you-need-to-open).
:::

### PHP

Axolotl-PM requires PHP 8.1 or newer, the same as PMMP 5. It also needs the `webrtc` PHP extension for NetherNet, which PMMP's PHP binaries don't include.

Use the PHP binaries from [axolotl-pm/PHP-Binaries](https://github.com/axolotl-pm/PHP-Binaries/releases), which include it. The official installer downloads them for you.

## Switching to Axolotl-PM

::: warning Warning
Stop your server and back up the whole server folder before you start.
:::

### Using the official installer (Linux/MacOS only)

`cd` into your existing server folder and run the [official installer](/docs/installation/get-dot-axolotl-pm-dot-org):

```sh
curl -sL https://get.axolotl-pm.org | bash -s -
```

The installer replaces `PocketMine-MP.phar`, `start.sh` and the `bin` folder with the Axolotl-PM versions. It doesn't touch your worlds, plugins, player data or configuration files.

::: warning Warning
The installer deletes any folder named `src` in the server folder. Move it somewhere else first if you keep your own files there.
:::

### Using Docker

Change the image to `ghcr.io/axolotl-pm/pocketmine-mp` and keep the rest of your setup. The Axolotl-PM image uses the same `/data` and `/plugins` volumes, the same user ID (1000), and the same `POCKETMINE_PLUGINS` and `POCKETMINE_ARGS` environment variables as the PMMP image.

See [Using Docker](/docs/installation/docker) for the full instructions.

### Installing manually

Follow [Installing/updating manually](/docs/installation/installing-manually), using your existing server folder. Replace `PocketMine-MP.phar` with the one from the [latest Axolotl-PM release](https://github.com/axolotl-pm/PocketMine-MP/releases/latest), and replace the `bin` folder with an Axolotl-PM PHP binary.

The file name stays `PocketMine-MP.phar`, so your start scripts keep working.

## After switching

1. Update the `host` settings in `pocketmine.yml` as described in [Configuration](#configuration).
2. If you want to use NetherNet, add the `transport` section and open the required ports as described in [NetherNet](#nethernet).
3. Start the server and check the console for plugins that fail to load.
4. If you use plugins that depend on the network API, check whether their authors have released an update.

## For plugin developers

Axolotl-PM is published on Packagist as `axolotl-pm/pocketmine-mp`. It declares that it replaces `pocketmine/pocketmine-mp`, so you can swap the dependency in your `composer.json` for tools like PHPStan.

Everything that changed since PMMP 5.44.3 is listed in the [changelogs](https://github.com/axolotl-pm/PocketMine-MP/tree/stable/changelogs).

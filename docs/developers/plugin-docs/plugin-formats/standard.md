---
title: "Standard plugin types"
outline: deep
description: A Phar plugin is the standard plugin type of Axolotl-PM. It is commonly used to distribute pre-made plugins, because it's easy for users to download and move around without needing to modify the plugin code.
---

# Standard plugin types

## Phar

This plugin format consists of a single [PHAR](https://www.php.net/manual/en/intro.phar.php) file which bundles all of the files necessary to make the plugin work.
This type of plugin is commonly used to distribute pre-made plugins, because they are easy for users to download and move around without needing to modify the plugin code.

### Loading

1. Drop the `.phar` file into your `plugins` directory.
2. Restart the server. The plugin will be loaded (if compatible).

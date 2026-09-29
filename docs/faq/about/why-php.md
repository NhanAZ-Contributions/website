---
title: "Why PHP?"
outline: deep
description: Why PHP was chosen for making Axolotl-PM (PocketMine).
---

# Why PHP?

Back in its early days, PocketMine-MP (at the time known as [Pocket Minecraft PHP](https://github.com/axolotl-pm/PocketMine-MP/commit/ba3524dbc7ea98d305c74f00ea6c9a260402c928)) was intended as a **quick prototype** for reverse engineering the Minecraft PE protocol by its creator, [Shoghi Cervantes](https://github.com/shoghicp). It was **never intended** for use on production servers. ([Tweet from @shoghicp](https://twitter.com/shoghicp/status/931944880733081601))

Since PocketMine-MP was the only server software available for Minecraft PE at the time, it quickly grew in popularity and started to be used by thousands of servers.
[Lifeboat Survival Games](https://lbsg.net) was one of the first big servers in Minecraft PE, and it was built using PocketMine-MP.

PMMP was popular because it was the oldest and most well-known Bedrock server software out there, as well as being really easy to develop plugins for.

Axolotl-PM is an actively maintained fork of PMMP, so it is written in PHP as well. PMMP plugins are compatible with Axolotl-PM unless they use the network API.

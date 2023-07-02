# brackets-manager.js

[![npm](https://img.shields.io/npm/v/brackets-manager.svg)](https://www.npmjs.com/package/brackets-manager)
[![Downloads](https://img.shields.io/npm/dt/brackets-manager.svg)](https://www.npmjs.com/package/brackets-manager)
[![Package Quality](https://packagequality.com/shield/brackets-manager.svg)](https://packagequality.com/#?package=brackets-manager)

A simple library to manage tournament brackets (round-robin, single elimination, double elimination).

It contains all the logic needed to manage tournaments.

# Features

- [BYE](https://en.wikipedia.org/wiki/Bye_%28sports%29) supported: only during creation (for seeding and balancing).
- Forfeit supported: only during updates.
- Match supported (locked, waiting, ready, running, completed, archived).
- Multiple stages per tournament.
  - So you can first have a round-robin stage (which will give you a seeding), then an elimination stage.

# Interface

- This library doesn't come with a GUI to create and update tournaments.
- You can use [brackets-viewer.js](https://github.com/Drarig29/brackets-viewer.js) to display the current state of a stage.
- It is designed to be used with any type of storage (JSON, in-memory, SQL, Redis, and more).
- Some storage implementations are already available (see the [documentation](https://drarig29.github.io/brackets-docs/user-guide/storage/)).

# Getting Started

For more information, see the [documentation](https://drarig29.github.io/brackets-docs/getting-started/).

```js
const { JsonDatabase } = require('brackets-json-db');
const { BracketsManager } = require('brackets-manager');

const storage = new JsonDatabase();
const manager = new BracketsManager(storage);

// Create an elimination stage for tournament `3`.
await manager.create.stage({
  tournamentId: 3,
  name: 'Elimination stage',
  type: 'double_elimination',
  seeding: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
  settings: { grandFinal: 'double' },
});

await manager.update.match({
  id: 0, // First match of winner bracket (round 1)
  opponent1: { score: 16, result: 'win' },
  opponent2: { score: 12 },
});
```

Rendered with the [viewer](https://github.com/Drarig29/brackets-viewer.js):

<img width="581" alt="image" src="https://user-images.githubusercontent.com/9317502/232905749-195c4f40-527c-4f17-a639-82f639432ed9.png">

As you can see, the [manager](https://drarig29.github.io/brackets-docs/reference/manager/classes/BracketsManager.html) is composed of submodules, which themselves have methods:
  - [`create`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Create.html) module: [`manager.create.stage()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Create.html#stage)
  - [`get`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Get.html) module: [`manager.get.seeding()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Get.html#seeding), [`manager.get.finalStandings()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Get.html#finalStandings), ...
  - [`update`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Update.html) module: [`manager.update.match()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Update.html#match), [`manager.update.confirmSeeding()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Update.html#confirmSeeding), ...
  - [`reset`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Reset.html) module: [`manager.reset.seeding()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Reset.html#seeding), [`manager.reset.matchGame()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Reset.html#matchResults), ...
  - [`delete`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Delete.html) module: [`manager.delete.stage()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Delete.html#stage)
  - [`find`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Find.html) module: [`manager.find.match()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Find.html#match), [`manager.find.nextMatches()`](https://drarig29.github.io/brackets-docs/reference/manager/classes/_internal_.Find.html#nextMatches), ...
  - [`storage`](https://drarig29.github.io/brackets-docs/reference/manager/interfaces/Storage.html) module: this gives you access to the abstract storage interface. Use it as a last resort.

You can navigate the API documentation here: [`BracketsManager` class documentation](https://drarig29.github.io/brackets-docs/reference/manager/classes/BracketsManager.html)

All the helpers defined by the library are available [here](https://drarig29.github.io/brackets-docs/reference/manager/modules/helpers.html):

```js
const { helpers } = require('brackets-manager');
```

# Credits

This library has been created to be used by the [Nantarena](https://nantarena.net/).

It has been inspired by:

- [Toornament](https://www.toornament.com/en_US/) (configuration, API and data format)
- [Challonge's bracket generator](https://challonge.com/tournaments/bracket_generator)
- [jQuery Bracket](http://www.aropupu.fi/bracket/) (feature examples)

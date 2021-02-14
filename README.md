# brackets-manager.js

A simple library to manage tournament brackets (round-robin, single elimination, double elimination).

It contains all the logic needed to manage tournaments.

[![npm](https://img.shields.io/npm/v/brackets-manager.svg)](https://www.npmjs.com/package/brackets-manager)
[![Downloads](https://img.shields.io/npm/dt/brackets-manager.svg)](https://www.npmjs.com/package/brackets-manager)
[![Package Quality](https://packagequality.com/shield/brackets-manager.svg)](https://packagequality.com/#?package=brackets-manager)

# Features

- [BYE](https://en.wikipedia.org/wiki/Bye_%28sports%29) supported: only during creation (for seeding and balancing).
- Forfeit supported: only during updates.
- Match  supported (locked, waiting, ready, running, completed, archived).

## Round-robin

- Each participant plays each opponent once.
- No limitation nor restriction in numbers.

## Single elimination

- Number of participants : 8, 16, 32, etc. (powers of two)
- Optional Consolation Final : matches semi-final losers.
- Handles up to 4 first places.

## Double elimination

- Twice the number of matches.
- Contains a Winner Bracket (WB), and a Loser Bracket (LB).
- Number of participants : 8, 16, 32, etc. (powers of two)
- Optional Grand Final : matches the WB winner against the LB winner.
  - Can be simple or double.
- Handles up to 3 first places.

# Interface

- This library doesn't come with a GUI to create and update tournaments.
- You can use [brackets-viewer.js](https://github.com/Drarig29/brackets-viewer.js) to display the current state of a stage.
- It is designed to be used with any storage.
- An example of JSON storage is given to run tests. You can use it out of the box.
- It uses asynchronous calls to a storage interface to be able to handle asynchronous SQL requests (for example).

# Credits

This library has been created to be used by the [Nantarena](https://nantarena.net/).

It has been inspired by:

- [Toornament](https://www.toornament.com/en_US/) (configuration, API and data format)
- [Challonge's bracket generator](https://challonge.com/tournaments/bracket_generator)
- [jQuery Bracket](http://www.aropupu.fi/bracket/) (feature examples)

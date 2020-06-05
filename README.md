# brackets-manager.js

A simple library to manage tournament brackets (round-robin, single elimination, double elimination).

It contains all the logic needed to manage tournaments.

# Features

- [BYE](https://en.wikipedia.org/wiki/Bye_%28sports%29) and forfait supported.
- Match status supported (pending, running, completed).

## Round-robin

- Each participant plays each opponent once.
- No limitation nor restriction in numbers.

## Single elimination

- Number of participants : 8, 16, 32, etc. (powers of two)
- Optional Consolation Final : matches semi-final losers.
- Handles up to 3 first places.

## Double elimination

- Contains a Winner Bracket (WB) and a Loser Bracket (LB).
- Number of participants : 8, 16, 32, etc. (powers of two)
- Optional Grand Final : matches the WB winner against the LB winner.
  - Can be simple or double.
- Handles up to 3 first places.

# Interface

- This library doesn't come with a GUI to create and update tournaments. You need to create your own.
- You can use [brackets-viewer.js](https://github.com/Drarig29/brackets-viewer.js) to display the current state of a stage.
- It is designed to be used with any storage.
- An example of JSON storage is given to run tests, but you can use it out of the box.
- It uses asynchronous calls to a storage interface to be able to handle asynchronous SQL requests.

# Credits

This library has been created to be used by the [Nantarena](https://nantarena.net/).

It has been inspired by:

- [Toornament](https://www.toornament.com/en_US/) (configuration, API and data format)
- [jQuery Bracket](http://www.aropupu.fi/bracket/) (features examples)
- [Responsive Tournament Bracket](https://codepen.io/jimmyhayek/full/yJkdEB) (connection between matches in plain CSS)
- [Challonge's bracket generator](https://challonge.com/tournaments/bracket_generator)
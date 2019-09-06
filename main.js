var board = null;
var game = new Chess();


function onDragStart (source, piece, position, orientation) {
  return !game.game_over() &&
    ((game.turn() === 'w' && piece.search(/^b/) === -1) ||
     (game.turn() === 'b' && piece.search(/^w/) === -1));
}

function onDrop (source, target) {
  var move = game.move({
    from: source,
    to: target,
    promotion: 'q' // TODO: always promote to a queen for example simplicity
  });

  // illegal move
  if (move === null) return 'snapback'
}

function onSnapEnd () {
  board.position(game.fen());
}

var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd
};

board = Chessboard('myBoard', config);

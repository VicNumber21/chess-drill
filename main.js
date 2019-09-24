// TODO: it is experimental for this or that. Refactor when it is clear how to implement modules.
// TODO: use modern JavaScript. The only requirement for Browser is Chrome on desktop and Safari in iOS
// TODO: contribute into chessboard instead of hacking it?

var db = new Dexie('my-chess-openings');
// TODO: check if all fields should be indexed
// TODO check if tags and moves should be in separate tables
db.version(1).stores({
  positions: '++id,&fen,*tags',
  moves: 'from,to,san,rating,&[from+san]',
  tags: '++id,&tag'
});
db.open().catch((error) => {
  console.error('DB opening error:', error);
});


var board = null;
var game = new Chess();
var startFen = game.fen();
var $board = $('#myBoard');
var $tagEditor = $('#tagEditor');
var squareClass = 'square-55d63';
var highlightClass = 'highlight-square';
var moveCache = [];
var tags = {};


function addTag(tag) {
  tags[tag] = true;
}

function removeTag(tag) {
  delete tags[tag];
}

function getTags() {
  return Object.keys(tags);
}

function clearTags() {
  tags = {};
}

function updateTagEditor() {
  $tagEditor.find('div.ui.tag').remove();

  const tags = getTags();

  for(const tag of tags) {
    $tagEditor.find('.title').append(
      '<div class="ui tag label">' +
        tag +
      '<i class="delete icon"></i>' +
      '</div>'
    );
  }

  for(let $tag of $tagEditor.find('div.ui.tag')) {
    $tagEditor.find($tag).find('i.delete').click(() => {
      removeTag($tag.innerText);
      updateTagEditor();
    });
  }
}

function doMove(from, to) {
  // TODO save them, attached to move
  // TODO it should be events about move done, UI stuff should be there
  clearTags();
  updateTagEditor();

  return game.move({
    from: from,
    to: to,
    promotion: 'q' // TODO: always promote to a queen for example simplicity
  });
}

function onDragStart(source, piece, position, orientation) {
  return !game.game_over() &&
    ((game.turn() === 'w' && piece.search(/^b/) === -1) ||
     (game.turn() === 'b' && piece.search(/^w/) === -1));
}

function onDrop(source, target) {
  var ret;
  var move = doMove(source, target);

  // illegal move
  if (move) {
    updateMoveCache(source, target);
  }
  else {
    if (source !== target) {
      clearMoveCache();
      ret = 'snapback'
    }
  }

  return ret;
}

function onSnapEnd() {
  board.position(game.fen());
}

function updateMoveCache(square1, square2) {
  if (square2 || moveCache.length === 2) {
    clearMoveCache();
  }

  moveCache.push(square1);

  if (square2) {
    moveCache.push(square2);
  }

  onMoveCacheUpdated();
}

function clearMoveCache() {
  moveCache = [];
  onMoveCacheUpdated();
}

function onMoveCacheUpdated() {
  $board.find('.' + squareClass).removeClass(highlightClass);

  moveCache.forEach(function (square) {
    $board.find('.square-' + square).addClass(highlightClass);
  });
}

function onLeftMouseClickOnSquare(square) {
  var piece = game.get(square);
  var isMoveEnd = moveCache.length === 1;
  var isMovablePiece = piece && piece.color === game.turn();

  if (moveCache.length === 2 && isMovablePiece) {
    clearMoveCache();
  }

  if (isMovablePiece || isMoveEnd) {
    updateMoveCache(square);
  }

  if (moveCache.length === 2 && isMoveEnd) {
    var move = doMove(moveCache[0], moveCache[1]);

    if (move) {
      board.position(game.fen());
    }
    else {
      clearMoveCache();
    }
  }

  return true;
}

function onRightMouseClickOnSquare() {
  clearMoveCache();
  return false;
}

function isValidSquare(square) {
  return square.length > 0; //TODO: should be better check
}

// TODO: touch handling should be added, see how it is implemented in chess board for reference
$board.on('mousedown', '.square-55d63', function (event) {
  var ret = true;
  var square = $(this).attr('data-square');

  if (isValidSquare(square)) {
    switch (event.which) {
      case 1:
        ret = onLeftMouseClickOnSquare(square);
        break;

      case 3:
        ret = onRightMouseClickOnSquare(square);
        break;

      default:
        break;
    }
  }

  return ret;
});

var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd
};

board = Chessboard('myBoard', config);
addTag('start');

// TODO remove not needed tags
async function saveTag(tag) {
  let tagId;

  try {
    tagId = await db.tags.add({tag: tag});
  }
  catch(error) {
    const tagObj = await db.tags.get({tag: tag});
    tagId = tagObj.id;
  }

  return tagId;
}

function saveTags(tags) {
  let tagPromises = tags.map(saveTag);
  return Promise.all(tagPromises);
}

async function savePosition(fen, tags) {
  let positionId;
  const tagIds = await saveTags(tags);

  try {
    positionId = await db.positions.add({fen: fen, tags: tagIds});
  }
  catch(error) {
    // TODO update tags for the position
    const position = await db.positions.get({fen: fen});
    positionId = position.id;
  }

  return positionId;
}

$(document).ready(() => {
  // Semantic UI
  $('.ui.accordion').accordion();
  updateTagEditor();

  $tagEditor.find('a.ui.tag').click(() => {
    let $input = $tagEditor.find('input');
    const tag = $input.val();
    $input.val('');
    addTag(tag);
    updateTagEditor();
  });

  $('#btnSave').click(() => {
    console.log('Saving history for', game.history(), ', current fen', game.fen());

    const savingHistory = game.history();
    let savingGame = new Chess();

    db.transaction('rw', db.positions, db.moves, db.tags, async () => {
      for(const move of savingHistory) {
        const fromFen = savingGame.fen();
        savingGame.move(move);
        const toFen = savingGame.fen();

        // TODO tags shoould be assigned to each position
        [fromPositionId, toPositionId] = await Promise.all([savePosition(fromFen, getTags()), savePosition(toFen, [])]);

        try {
          db.moves.add({from: fromPositionId, to: toPositionId, san: move, rating: 'good'});
        }
        catch (error) {
          // TODO how to ignore it just in case the same move is recorded already?
        }
      }
    }).catch((error) => {
      console.error('DB transaction error', error);
    });
  });
});

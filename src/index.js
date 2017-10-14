const html = require('choo/html')
const choo = require('choo')
const Microframe = require('microframe')
const log = require('choo-log')
const css = require('sheetify')

const GRID_SIZE = 20
const INITIAL_SPEED = 600
const MAX_SPEED = 30
const SPEED_FACTOR = 10
const frame = Microframe()

const DIRECTION_RIGHT = 'right'
const DIRECTION_LEFT = 'left'
const DIRECTION_TOP = 'top'
const DIRECTION_BOTTOM = 'bottom'

function coordinateEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1]
}

css('./normalize.css')
css('./style.css')

const app = choo()
app.use(log())
app.use(snakeStore)
app.route('/*', mainView)
app.mount('body')

function revealView (text, show, pixels) {
  return html`<div class="reveal ${show ? '' : 'hidden'}" style="width: ${pixels}px; height: ${pixels}px; line-height: ${pixels - 40}px;">${text}</div>`
}

function mainView (state, emit) {
  return html`
    <body onkeyup="${onkeyup}">
      <div class="container" style="width: ${state.grid_pixels}px">
        ${revealView('Paused', state.paused, state.grid_pixels)}
        ${revealView('Game Over', state.gameover, state.grid_pixels)}
        ${state.grid.map((e, y) => html`<div class="line">${
          state.grid.map((e, x) => html`<div class="column ${isActive(x, y)} ${hasCandy(x, y)}"></div>`)
        }</div>`)}
      </div>
      <br>
      <pre class="container"><code>Speed: ${state.speed} | Length: ${state.snakeLength} | P: Pause | N: New game</code></pre>
      <br>
      <form onsubmit="${newGame}" class="container">
        <label for="grid-size">Grid size:</label>
        <input type="number" id="grid-size" onchange="${gridSize}" value="${state.config.grid_size}" readonly="${!state.paused ? 'readonly' : ''}">
        <label for="initial-speed">Initial speed:</label>
        <input type="number" id="initial-speed" min="${MAX_SPEED}" max="${INITIAL_SPEED}" onchange="${initialSpeed}" value="${state.config.initial_speed}" readonly="${!state.paused ? 'readonly' : ''}">
        <button type="submit">New game</button>
      </form>
      <div class="container"><a href="https://github.com/soyuka/snake/blob/master/src/index.js" target="_blank">Code</a></div>
    </body>
  `

  function initialSpeed(event) {
    emit('config', {initial_speed: +event.target.value})
  }

  function gridSize(event) {
    emit('config', {grid_size: +event.target.value})
  }

  function newGame(event) {
    event.preventDefault()
    emit('init')
  }

  function isActive (x, y) {
    for (let i = 0; i < state.snakeLength; i++) {
      if (state.snake[i][0] === x && state.snake[i][1] === y) {
        return 'active'
      }
    }

    return ''
  }

  function hasCandy(x, y) {
    return state.candy[0] === x && state.candy[1] === y ? 'candy' : ''
  }

  function onkeyup(event) {
    let direction

    switch(event.keyCode) {
      case 80:
        if (!state.gameover) {
          emit('pause')
        }
        return
      case 78:
        emit('init')
        return
    }

    if (state.paused || state.gameover) {
      return
    }

    switch(event.keyCode) {
      case 37:
        if (state.direction === DIRECTION_RIGHT) {
          return
        }

        direction = DIRECTION_LEFT
        break
      case 38:
        if (state.direction === DIRECTION_BOTTOM) {
          return
        }

        direction = DIRECTION_TOP
        break
      case 39:
        if (state.direction === DIRECTION_LEFT) {
          return
        }

        direction = DIRECTION_RIGHT
        break
      case 40:
        if (state.direction === DIRECTION_TOP) {
          return
        }

        direction = DIRECTION_BOTTOM
        break
    }

    if (direction) {
      emit('move', direction)
    }
  }
}

function move(state, emitter) {
  const last = state.snakeLength - 1
  const isX = state.direction === DIRECTION_LEFT || state.direction === DIRECTION_RIGHT
  const increment = state.direction === DIRECTION_RIGHT || state.direction === DIRECTION_BOTTOM
  const axis = isX ? 0 : 1
  const value = state.snake[last][axis]
  let newValue = increment ? value + 1 : value - 1

  if (newValue >= GRID_SIZE) {
    newValue = 0
  } else if (newValue < 0) {
    newValue = GRID_SIZE - 1
  }

  const snake = new Array(state.snakeLength).fill([0, 0])

  for (let i = last; i > 0; i--) {
    snake[i - 1] = state.snake[i].concat()
  }

  snake[last] = state.snake[last].concat()

  snake[last][axis] = newValue

  state.snake = snake

  // got candy
  if (isSnakeOnCandy(state, state.candy)) {
    state.candy = randomCandyPositionNotOnSnake(state)
    state.snakeLength++
    let member = state.snake[0].concat()
    member[axis] = increment ? member[axis] - 1 : member[axis] + 1
    snake.unshift(member)
    emitter.emit('speedup')
  } else if (isSnakeOnItself(state)) {
    emitter.emit('gameover')
  }
}

function randomCandyPosition () {
  const max = GRID_SIZE - 1
  return [Math.floor(Math.random()*max), Math.floor(Math.random()*max)]
}

function isSnakeOnCandy (state, candy) {
  for (let i = 0; i < state.snakeLength; i++) {
    if (coordinateEquals(state.snake[i], candy)) {
      return true
    }
  }

  return false
}

function isSnakeOnItself (state) {
  let t = state.snakeLength

  while (t--) {
    for (let i = 0; i < state.snakeLength && t !== i; i++) {
      if (coordinateEquals(state.snake[t], state.snake[i])) {
        return true
      }
    }
  }

  return false
}

function randomCandyPositionNotOnSnake (state) {
  let onSnake = true
  let candy = randomCandyPosition()

  while(isSnakeOnCandy(state, candy)) {
    candy = randomCandyPosition()
  }

  return candy
}

function snakeStore (state, emitter) {
  emitter.on('DOMContentLoaded', function () {
    state.interval = setInterval(tick, state.speed)
  })

  emitter.on('move', function (direction) {
    state.direction = direction
    state.tick = true
    move(state, emitter)
  })

  emitter.on('gameover', function () {
    clearInterval(state.interval)
    state.gameover = true
    emitter.emit('render')
  })

  emitter.on('pause', function () {
    if (state.paused) {
      state.interval = setInterval(tick, state.speed)
    } else {
      clearInterval(state.interval)
    }

    state.paused = !state.paused
    emitter.emit('render')
  })

  emitter.on('speedup', function () {
    if (state.speed <= MAX_SPEED) {
      return
    }

    clearInterval(state.interval)
    state.speed -= SPEED_FACTOR
    state.interval = setInterval(tick, state.speed)
  })

  emitter.on('init', function () {
    init()
    emitter.emit('render')
    clearInterval(state.interval)
    state.interval = setInterval(tick, state.speed)
  })

  emitter.on('config', function (config) {
    state.config = Object.assign(state.config, config)
  })

  function tick() {
    frame(function () {
      if (state.tick === false) {
        move(state, emitter)
      }

      emitter.emit('render')
      state.tick = false
    })
  }

  function init() {
    state.grid = new Array(state.config.grid_size).fill(new Array(state.config.grid_size))
    state.snake = [[0,0], [1,0], [2,0]]
    state.snakeLength = 3
    state.speed = state.config.initial_speed
    state.direction = DIRECTION_RIGHT
    state.interval = null
    state.tick = false
    state.candy = randomCandyPositionNotOnSnake(state)
    state.paused = false
    state.gameover = false
    state.grid_pixels = state.config.grid_size * 15
  }

  state.config = {
    grid_size: GRID_SIZE,
    initial_speed: INITIAL_SPEED
  }

  init()
}

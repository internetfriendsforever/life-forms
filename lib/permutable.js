var permutable = (function (hyperhtml, css, kefir) {
  'use strict';

  css = css && css.hasOwnProperty('default') ? css['default'] : css;

  const pool = {};

  function wires (a) {
    return {
      wire: pool[a] || (pool[a] = hyperhtml.wire()),
      next: b => wires(`${a}.${b}`)
    }
  }

  const styles = {
    button: active => css(`
    display: block;
    font: inherit;
    text-transform: inherit;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    border: 0;
    margin: 0;
    padding: 0;
    outline: 0;
    white-space: nowrap;
    text-align: left;

    ${active ? `
      color: gold;
      border-color: gold;
    ` : `
      :hover {
        color: white;
        border-color: white;
      }

      :active {
        color: gold;
        border-color: gold;
      }
    `}
  `)
  };

  function button ({ key = 'button', id, active, label, wires, className }) {
    const { wire } = wires(key);

    return wire`
    <button id=${id} className=${css(styles.button(active), className)}>
      ${label}
    </div>
  `
  }

  const styles$1 = {
    button: css(`
    padding: 0.15em 0.4em;
  `)
  };

  function input ({ key = 'input', mapping, wires }) {
    const { wire, next } = wires(key);

    const { id, port, pending } = Object.assign({
      id: '',
      port: '',
      pending: false
    }, mapping);

    return wire`
    <div data-input data-pending=${pending} data-port=${port} data-id=${id}>
      ${button({
        label: id || 'input',
        className: styles$1.button,
        active: pending,
        wires: next
      })}
    </div>
  `
  }

  const styles$2 = {
    container: css(`
  `),

    slider: css(`
    position: relative;
    flex: auto;
    cursor: ew-resize;
    display: flex;
    padding: 0.4rem 0.5rem;

    :hover {
      color: white;
    }

    // :active {
    //   color: gold;
    // }
  `),

    indicator: css(`
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: gold;
    border-left: 1px solid gold;
    mix-blend-mode: difference;
  `),

    name: css(`
    position: relative;
    flex: auto;
    margin-right: 0.75rem;
  `),

    value: css(`
    position: relative;
    flex: 0;
  `),

    input: css(`
    width: 1px;
  `)
  };

  function number ({ min = 0, max = 1, step = 0.01, value, mapping, key, wires }) {
    const { wire, next } = wires(key);

    const range = max - min;
    const percent = ((value - min) / range) * 100;
    const indicatorStyle = `width: ${percent}%`;

    const decimals = (step.toString().split('.')[1] || '').length;
    const displayValue = value.toFixed(decimals);

    return wire`
    <tr className=${styles$2.container} data-control='number' data-key=${key}>
      <td className=${styles$2.slider} data-slider data-min=${min} data-max=${max} data-step=${step}>
        <div className=${styles$2.name}>${key}</div>
        <div className=${styles$2.value}>${displayValue}</div>
        <div className=${styles$2.indicator} style=${indicatorStyle}></div>
      </td>

      <td className=${styles$2.input}>
        ${input({ mapping, wires: next })}
      </td>
    </tr>
  `
  }

  const styles$3 = {
    container: css(`
    border-top: 1px transparent solid;
  `),

    toggle: on => css(`
    position: relative;
    flex: auto;
    cursor: pointer;
    display: flex;
    padding: 0.15rem 0.4rem;

    :hover {
      color: white;
    }

    :active {
      color: gold;
    }

    ${on && `
      background: #333;
    `}
  `),

    name: css(`
    flex: auto;
    margin-right: 0.75rem;
  `),

    value: css(`
    flex: 0;
  `),

    input: css(`
    width: 1px;
  `)
  };

  function boolean ({ value, mapping, key, wires }) {
    const { wire, next } = wires('key');

    return wire`
    <tr className=${styles$3.container} data-control='boolean' data-key=${key} data-value=${value}>
      <td className=${styles$3.toggle(value)} data-toggle>
        <div className=${styles$3.name}>${key}</div>
        <div className=${styles$3.value}>${value ? 'yes' : 'no'}</div>
      </td>

      <td className=${styles$3.input}>
        ${input({ mapping, wires: next })}
      </td>
    </tr>
  `
  }

  const styles$4 = {
    container: css(`
    margin: 2px 0;
  `),

    select: css(`
    appearance: none;
    font: inherit;
    color: inherit;
    border: 0;
    background: 0;
    padding: 0.1rem 0.2rem;
    cursor: pointer;

    :hover {
      color: white;
    }

    :active {
      color: gold;
    }
  `),

    input: css(`
    width: 1px;
  `)
  };

  function sampler ({ value, mapping, key, channels, wires }) {
    const { wire, next } = wires(key);

    return wire`
    <tr className=${styles$4.container} data-control='sampler' data-key=${key}>
      <td>
        <select className=${styles$4.select}>
          <option value='' selected>
            Select ${key}...
          </option>

          ${Object.keys(channels).map(key => (
            next(key).wire`<option value=${key}>
              ${channels[key].title}
            </option>`
          ))}
        </select>
      </td>

      <td className=${styles$4.input}></td>
    </tr>
  `
  }

  const styles$5 = {
    container: css(`
    width: 100%;
    border-collapse: collapse;
    color: inherit;
  `)
  };

  function control ({ key, params, mappings, channels, wires }) {
    const { wire, next } = wires(key || 'controls');

    return wire`
    <table className=${styles$5.container}>
      ${Object.keys(params).map(key => {
        const props = {
          key,
          ...params[key],
          mapping: mappings[key],
          channels: channels,
          wires: next
        };

        switch (props.type) {
          case 'number':
            return number(props)
          case 'boolean':
            return boolean(props)
          case 'sampler':
            return sampler(props)
        }

        return null
      }).filter(v => v)}
    </table>
  `
  }

  const streams = {};

  const events = [
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseleave',
    'click',
    'dragstart',
    'dragover',
    'dragleave',
    'drop',
    'keydown',
    'change'
  ];

  events.forEach(event => {
    streams[event] = kefir.fromEvents(document.body, event);
  });

  const midi = kefir.stream(emitter => {
    if ('requestMIDIAccess' in navigator) {
      navigator.requestMIDIAccess().then(access => {
        for (const input of access.inputs.values()) {
          input.addEventListener('midimessage', event => {
            const [type, port, rawValue] = event.data;
            const value = rawValue / 127;
            emitter.value({ type, port, value, input });
          });
        }
      });
    }
  });

  const findInput = event => event.target.closest('[data-input]');
  const isPending = element => element.getAttribute('data-pending') === 'true';

  const clicks = streams.click.map(findInput).filter();

  const pending = clicks.map(element => ({
    element,
    mapping: {
      id: element.getAttribute('data-id'),
      pending: !isPending(element)
    }
  }));

  const elements = kefir.merge([clicks]).scan((set, element) => set.add(element), new Set());

  const backspace = streams.keydown.filter(event => event.keyCode === 8);

  const remove = kefir.combine([backspace], [elements], (event, elements) => {
    const updates = [];

    for (const element of elements) {
      if (isPending(element)) {
        updates.push({
          element,
          mapping: {
            id: null,
            pending: false
          }
        });
      }
    }

    return updates
  }).flatten();

  const input$1 = kefir.combine([midi], [elements], (midi, elements) => {
    const { input, type, port, value } = midi;

    const id = `${input.name} #${port}`;
    const updates = [];

    for (const element of elements) {
      if (isPending(element)) {
        const pending = false;
        const mapping = { id, pending, value };

        updates.push({
          element,
          mapping,
          type,
          value
        });
      }

      if (element.getAttribute('data-id') === id) {
        updates.push({
          element,
          type,
          value
        });
      }
    }

    return updates
  }).flatten();

  var midi$1 = kefir.merge([
    pending,
    remove,
    input$1
  ]);

  const findBoolean = element => element.closest('[data-control=boolean]');
  const findToggle = element => findBoolean(element) && element.closest(`[data-toggle]`);

  const target = event => event.target;

  const getValue = element => element.getAttribute('data-value') === 'true';

  const toggleUpdates = streams.click
    .map(target)
    .filter(findToggle)
    .map(findBoolean)
    .map(element => ({
      element: element,
      key: element.getAttribute('data-key'),
      value: !getValue(element)
    }));

  const midiUpdates = midi$1
    .filter(input => findBoolean(input.element))
    .map(input => {
      const updates = { ...input };

      updates.element = findBoolean(input.element);

      if (input.value) {
        if (input.type === 144) {
          updates.value = !getValue(updates.element);
        } else if (input.type === 128) {
          delete updates.value;
        } else {
          updates.value = input.value > 0.5;
        }
      }

      return updates
    });

  var booleanControl = kefir.merge([
    toggleUpdates,
    midiUpdates
  ]);

  const findNumber = element => element.closest(`[data-control=number]`);
  const target$1 = event => event.target;

  const mouseElement = streams.mousedown.map(target$1).map(findNumber).filter();

  const mouseActive = kefir.merge([
    streams.mousedown.map(target$1).filter(findNumber).map(() => true),
    streams.mouseup.map(target$1).filter(findNumber).map(() => false),
    streams.mousemove.map(event => event.buttons === 1).filter(value => !value)
  ]).skipDuplicates();

  const mouseUpdates = kefir.combine([
    streams.mousemove,
    mouseActive
  ], [
    mouseElement
  ], (event, active, element) => {
    if (active && element) {
      const slider = element.querySelector('[data-slider]');

      const rect = slider.getBoundingClientRect();
      const position = (event.clientX - Math.floor(rect.left)) / Math.floor(rect.width);

      return {
        element,
        position
      }
    }

    return null
  })
    .filter(value => value !== null);

  const midiUpdates$1 = midi$1
    .filter(input => findNumber(input.element))
    .map(input => {
      const updates = { ...input };

      updates.element = findNumber(input.element);

      if (updates.value) {
        if (input.type === 144) updates.value = 1;
        if (input.type === 128) updates.value = 0;
      }

      return updates
    });

  var numberControl = kefir.merge([
    midiUpdates$1,
    mouseUpdates
  ]).map(({ element, position }) => {
    const slider = element.querySelector('[data-slider]');
    const min = parseFloat(slider.getAttribute('data-min'), 10);
    const max = parseFloat(slider.getAttribute('data-max'), 10);
    const step = parseFloat(slider.getAttribute('data-step'), 10);
    const range = (max - min);
    const stepped = min + Math.floor((position * range) / step) * step;
    const value = Math.max(min, Math.min(max, stepped));

    return {
      element,
      min,
      max,
      step,
      value
    }
  })
    .skipDuplicates((a, b) => a.value === b.value);

  // import items from '../channels/items.js'

  const items = kefir.constant({});

  const findSampler = element => element.closest('[data-control=sampler]');

  const target$2 = event => event.target;

  const changes = kefir.combine([
    streams.change
      .map(target$2)
      .filter(findSampler)
      .map(findSampler)
      .map(element => ({
        element: element,
        key: element.getAttribute('data-key'),
        channel: element.querySelector('select').value
      }))
  ], [items], (change, items) => {
    return {
      element: change.element,
      key: change.key,
      value: change.channel ? items[change.channel].canvas : null
    }
  });

  var changes$1 = kefir.merge([
    booleanControl,
    numberControl,
    changes
  ]);

  var state = (initial = {}) => changes$1
    .scan((all, change) => {
      const key = change.element.getAttribute('data-key');
      const type = change.element.getAttribute('data-control');

      return {
        ...all,
        [key]: {
          type: type,
          ...change
        }
      }
    }, initial);

  var controls = {
    component: control,
    state
  };

  var rafLimit = stream => {
    let value;
    let frame;

    return stream.withHandler((emitter, event) => {
      if (event.type === 'end') {
        emitter.end();
      }

      if (event.type === 'value') {
        value = event.value;

        if (!frame) {
          frame = window.requestAnimationFrame(() => {
            frame = null;
            emitter.emit(value);
          });
        }
      }
    })
  };

  var styles$6 = css(`
  font-family: monospace;
  margin: 0;
  background: black;
  color: #aaa;
  user-select: none;
  text-transform: uppercase;
`);

  const controlStyles = css(styles$6, `
  position: absolute;
  top: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.9);
`);

  var index = async program => {
    const canvas = document.createElement('canvas');

    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    document.body.style.background = 'black';
    document.body.style.margin = 0;

    const render = await Promise.resolve(program.setup(canvas));
    const state$$1 = controls.state(program.params);

    rafLimit(state$$1).onValue(params => {
      if (render) {
        render(params);
      }

      hyperhtml.bind(document.body)`
      ${canvas}

      <div className=${controlStyles}>
        ${controls.component({
          params,

          mappings: {
            play: null,
            mix: null
          },

          wires
        })}
      </div>
    `;
    });
  };

  return index;

}(hyperHTML, happycat.css, Kefir));

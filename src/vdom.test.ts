import { createElement, render } from './vdom'

describe('createElement', () => {
  test('div', () => {
    const res = createElement('div')
    const expected = {
      type: 'div',
      props: { children: [] },
    }
    expect(res).toMatchObject(expected)
  })

  test('div with props', () => {
    const res = createElement('div', { id: 'foo' })
    const expected = {
      type: 'div',
      props: {
        id: 'foo',
        children: [],
      },
    }
    expect(res).toMatchObject(expected)
  })

  test('div with children', () => {
    const res = createElement('div', null, 'bar')
    const expected = {
      type: 'div',
      props: {
        children: [
          {
            type: 'TEXT_ELEMENT',
            props: {
              nodeValue: 'bar',
              children: [],
            },
          },
        ],
      },
    }
    expect(res).toMatchObject(expected)
  })

  test('complex element', () => {
    const res = createElement(
      'div',
      { id: 'foo' },
      createElement('a', null, 'bar'),
      createElement('b'),
    )
    const expected = {
      type: 'div',
      props: {
        id: 'foo',
        children: [
          {
            type: 'a',
            props: {
              children: [
                {
                  type: 'TEXT_ELEMENT',
                  props: {
                    nodeValue: 'bar',
                    children: [],
                  },
                },
              ],
            },
          },
          {
            type: 'b',
            props: {
              children: [],
            },
          },
        ],
      },
    }
    expect(res).toMatchObject(expected)
  })
})

describe('render', () => {
  test('elements are rendered', () => {
    const container = document.createElement('div')
    const root = createElement('p', null, 'hello')
    render(root, container)
    expect(container.childElementCount).toBe(1)
  })
})

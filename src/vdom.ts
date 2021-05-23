type PrimitiveType = string | number

type PropsType = {
  [key: string]: PrimitiveType | NodeType[]
}

type NodeType = {
  type: string
  props: PropsType
}

export function createElement(
  type: string,
  props?: PropsType | null,
  ...children: (string | number | NodeType)[]
): NodeType {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child),
      ),
    },
  }
}

function createTextElement(text: string | number): NodeType {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  }
}

export function render(element: NodeType, container: HTMLElement | Text): void {
  const dom =
    element.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(element.type)

  const isProperty = (key: string) => key !== 'children'
  Object.keys(element.props)
    .filter(isProperty)
    // @ts-ignore
    .forEach((name) => (dom[name] = element.props[name]))

  const children = element.props.children as NodeType[]
  children.forEach((child) => render(child, dom))

  container.appendChild(dom)
}

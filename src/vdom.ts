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

type PrimitiveType = string | number

type PropsType = {
  [key: string]: PrimitiveType | FiberType[]
}

type FiberType = {
  type?: string
  props: PropsType
  child?: FiberType | null
  parent?: FiberType | null
  sibling?: FiberType | null
  dom?: HTMLElement | Text | null
  alternate?: FiberType | null
  effectTag?: 'PLACEMENT' | 'DELETION' | 'UPDATE'
}

export function createElement(
  type: string,
  props?: PropsType | null,
  ...children: (string | number | FiberType)[]
): FiberType {
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

function createTextElement(text: PrimitiveType): FiberType {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  }
}

function createDom(fiber: FiberType): HTMLElement | Text {
  console.log('createDom', fiber)
  const dom =
    fiber.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type as string)

  updateDom(dom, {}, fiber.props)

  return dom
}

const isEvent = (key: string) => key.startsWith('on')
const isProperty = (key: string) => key !== 'children' && !isEvent(key)
const isNew = (prev: PropsType, next: PropsType) => (key: string) =>
  prev[key] !== next[key]
const isGone = (prev: PropsType, next: PropsType) => (key: string) =>
  !(key in next)
function updateDom(
  dom: HTMLElement | Text,
  prevProps: PropsType,
  nextProps: PropsType,
) {
  console.log('updateDom', dom, prevProps, nextProps)

  // Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      // @ts-ignore
      dom.removeEventListener(eventType, prevProps[name])
    })

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      // @ts-ignore
      dom[name] = ''
    })

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      // @ts-ignore
      dom[name] = nextProps[name]
    })

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      // @ts-ignore
      dom.addEventListener(eventType, nextProps[name])
    })
}

function commitRoot() {
  console.log('commitRoot')
  deletions?.forEach(commitWork)
  commitWork(wipRoot?.child)
  currentRoot = wipRoot
  wipRoot = null
}

function commitWork(fiber: FiberType | null | undefined) {
  console.log('commitWork', fiber)
  if (!fiber) {
    return
  }

  const domParent = fiber.parent?.dom
  if (fiber.dom) {
    if (fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
      domParent?.appendChild(fiber.dom)
    } else if (fiber.effectTag === 'DELETION') {
      domParent?.removeChild(fiber.dom)
    } else if (
      fiber.effectTag === 'UPDATE' &&
      fiber.dom !== null &&
      fiber.alternate
    ) {
      updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    }
  }

  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

export function render(
  element: FiberType,
  container: HTMLElement | Text,
): void {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  }
  deletions = []
  nextUnitOfWork = wipRoot
}

let nextUnitOfWork: FiberType | null | undefined = null
let currentRoot: FiberType | null = null
let wipRoot: FiberType | null = null
let deletions: FiberType[] | null = null

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false
  while (nextUnitOfWork && !shouldYield) {
    // 基本ここで performUnitOfWork を nextUnitOfWork がなくなるまで続ける
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextUnitOfWork && wipRoot) {
    // nextUnitOfWork がなくなったら commit
    commitRoot()
  }

  requestIdleCallback(workLoop)
}

// queues a function to be called during a browser's idle periods
requestIdleCallback(workLoop)

// performs a unit of work and returns the next unit of work
function performUnitOfWork(fiber: FiberType) {
  console.log('performUnitOfWork', fiber)
  // add dom node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }

  const elements = fiber.props.children as FiberType[]
  reconcileChildren(fiber, elements)

  // search for the next unit of work (child -> sibling -> uncle)
  if (fiber.child) {
    return fiber.child
  }
  let nextFiber: FiberType | null | undefined = fiber
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    nextFiber = nextFiber.parent
  }
}

function reconcileChildren(wipFiber: FiberType, elements: FiberType[]) {
  console.log('reconcileChildren', wipFiber, elements)
  let index = 0
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child
  let prevSibling: FiberType | null = null

  while (index < elements.length || oldFiber != null) {
    const element = elements[index]
    let newFiber: FiberType | null = null

    const sameType = oldFiber && element && element.type == oldFiber.type

    if (sameType) {
      newFiber = {
        type: oldFiber?.type,
        props: element.props,
        dom: oldFiber?.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
      }
    }
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      }
    }
    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION'
      deletions?.push(oldFiber)
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling
    }

    if (index === 0) {
      wipFiber.child = newFiber
    } else if (element && prevSibling) {
      prevSibling.sibling = newFiber
    }

    prevSibling = newFiber
    index++
  }
}

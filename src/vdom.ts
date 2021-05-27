type PrimitiveType = string | number

type PropsType = {
  [key: string]: PrimitiveType | ElementType[]
}

type RootElementType = {
  dom: HTMLElement | Text
  props: PropsType
  alternate: RootElementType | null
  child?: ElementType
}

type ElementType = {
  type?: string
  props: PropsType
  child?: ElementType | null
  parent?: ElementType | null
  sibling?: ElementType | null
  dom?: HTMLElement | Text | null
  // a link to the old fiber, the fiber that we committed to the DOM in the previous commit phase
  alternate?: ElementType | null
  effectTag?: 'PLACEMENT' | 'DELETION' | 'UPDATE'
}

export function createElement(
  type: string,
  props?: PropsType | null,
  ...children: (string | number | ElementType)[]
): ElementType {
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

function createTextElement(text: PrimitiveType): ElementType {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  }
}

let nextUnitOfWork: ElementType | null | undefined = null
let currentRoot: RootElementType | null = null
let wipRoot: RootElementType | null = null
let deletions: ElementType[] | null = null

export function render(
  element: ElementType,
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

// while nextUnitOfWork: performUnitOfWork -> (createDom -> updateDom ->) reconcileChildren
// finally: commitRoot -> commitWork
function workLoop(deadline: IdleDeadline) {
  let shouldYield = false
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot()
  }

  requestIdleCallback(workLoop)
}

// performs a unit of work and returns the next unit of work
function performUnitOfWork(fiber: ElementType) {
  console.log('performUnitOfWork', fiber)
  // add dom node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }

  const elements = fiber.props.children as ElementType[]
  reconcileChildren(fiber, elements)

  // search for the next unit of work (child -> sibling -> uncle)
  if (fiber.child) {
    return fiber.child
  }
  let nextFiber: ElementType | null | undefined = fiber
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    nextFiber = nextFiber.parent
  }
}

function createDom(fiber: ElementType): HTMLElement | Text {
  console.log('createDom', fiber)
  const dom =
    fiber.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type as string)

  updateDom(dom, {}, fiber.props)

  return dom
}

function updateDom(
  dom: HTMLElement | Text,
  prevProps: PropsType,
  nextProps: PropsType,
) {
  const isEvent = (key: string) => key.startsWith('on')
  const isProperty = (key: string) => key !== 'children' && !isEvent(key)
  const isNew = (prev: PropsType, next: PropsType) => (key: string) =>
    prev[key] !== next[key]
  const isGone = (prev: PropsType, next: PropsType) => (key: string) =>
    !(key in next)

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

// reconcile the old fibers with the new elements
function reconcileChildren(wipFiber: ElementType, elements: ElementType[]) {
  console.log('reconcileChildren', wipFiber, elements)
  let index = 0
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child
  let prevSibling: ElementType | null = null

  while (
    index < elements.length ||
    (oldFiber !== null && oldFiber !== undefined)
  ) {
    const element = elements[index]
    let newFiber: ElementType | null = null

    const sameType = oldFiber && element && element.type == oldFiber.type

    // if the old fiber and the new element have the same type,
    // we can keep the DOM node and just update it with the new props
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
    // if the type is different and there is a new element, it means
    // we need to create a new DOM node
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
    // if the types are different and there is an old fiber,
    // we need to remove the old node
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

function commitRoot() {
  console.log('commitRoot')
  deletions?.forEach(commitWork)
  commitWork(wipRoot?.child)
  currentRoot = wipRoot
  wipRoot = null
}

function commitWork(fiber: ElementType | null | undefined) {
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

requestIdleCallback(workLoop)

type PrimitiveType = string | number

type EventHandlerType = (event: Event) => void

type PropsType = {
  [key: string]: PrimitiveType | ElementType[] | EventHandlerType
}

type RootElementType = {
  dom: HTMLElement | Text
  props: PropsType
  prev: RootElementType | null
  child?: ElementType
}

type ElementType = {
  type?: string | FunctionComponentType
  props: PropsType
  child?: ElementType | null
  parent?: ElementType | null
  sibling?: ElementType | null
  dom?: HTMLElement | Text | null
  // a link to the old fiber, the fiber that we committed to the DOM in the previous commit phase
  prev?: ElementType | null
  effectTag?: 'PLACEMENT' | 'DELETION' | 'UPDATE'
  // TODO: Do not use `any`
  hooks?: HookType<any>[]
}

type FunctionComponentType = (props: PropsType) => ElementType

type ActionType<T> = (state: T) => T
type HookType<T> = {
  state: T
  queue: ActionType<T>[]
}

export function createElement(
  type: string | FunctionComponentType,
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

let wipFiber: ElementType | null = null
let hookIndex: number | null = null

export function render(
  element: ElementType,
  container: HTMLElement | Text,
): void {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    prev: currentRoot,
  }
  deletions = []
  nextUnitOfWork = wipRoot
}

// while nextUnitOfWork: performUnitOfWork (-> createDom -> updateDom) -> reconcileChildren
// finally: commitRoot -> commitWork (-> updateDom)
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

// Performs a unit of work and returns the next unit of work
function performUnitOfWork(fiber: ElementType) {
  const isFunctionComponent = fiber.type instanceof Function
  if (isFunctionComponent) {
    updateFunctionComponent(fiber)
  } else {
    updateHostComponent(fiber)
  }

  // Search for the next unit of work (child -> sibling -> uncle)
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

function updateFunctionComponent(fiber: ElementType) {
  wipFiber = fiber
  hookIndex = 0
  wipFiber.hooks = []
  const f = fiber.type as FunctionComponentType
  const children = [f(fiber.props)]
  reconcileChildren(fiber, children)
}

export function useState<T>(
  initial: T,
): [state: T, setState: (action: ActionType<T>) => void] {
  const oldHook = hookIndex !== null ? wipFiber?.prev?.hooks?.[hookIndex] : null
  const hook: HookType<T> = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  }

  const actions: ActionType<T>[] = oldHook ? oldHook.queue : []
  actions.forEach((action) => {
    hook.state = action(hook.state)
  })

  const setState = (action: ActionType<T>) => {
    hook.queue.push(action)
    if (currentRoot) {
      wipRoot = {
        dom: currentRoot?.dom,
        props: currentRoot?.props,
        prev: currentRoot,
      }
    }

    nextUnitOfWork = wipRoot
    deletions = []
  }

  wipFiber?.hooks?.push(hook)
  if (hookIndex) hookIndex++
  return [hook.state, setState]
}

function updateHostComponent(fiber: ElementType) {
  // add dom node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }

  const children = fiber.props.children as ElementType[]
  reconcileChildren(fiber, children)
}

// Reconcile the old fibers with the new elements
function reconcileChildren(wipFiber: ElementType, children: ElementType[]) {
  let index = 0
  let oldFiber = wipFiber.prev && wipFiber.prev.child
  let prevSibling: ElementType | null = null

  while (
    index < children.length ||
    (oldFiber !== null && oldFiber !== undefined)
  ) {
    const child = children[index]
    let newFiber: ElementType | null = null

    const sameType = oldFiber && child && child.type == oldFiber.type

    // If the old fiber and the new element have the same type,
    // we can keep the DOM node and just update it with the new props
    if (sameType) {
      newFiber = {
        type: oldFiber?.type,
        props: child.props,
        dom: oldFiber?.dom,
        parent: wipFiber,
        prev: oldFiber,
        effectTag: 'UPDATE',
      }
    }
    // If the type is different and there is a new element, it means
    // we need to create a new DOM node
    if (child && !sameType) {
      newFiber = {
        type: child.type,
        props: child.props,
        dom: null,
        parent: wipFiber,
        prev: null,
        effectTag: 'PLACEMENT',
      }
    }
    // If the types are different and there is an old fiber,
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
    } else if (child && prevSibling) {
      prevSibling.sibling = newFiber
    }

    prevSibling = newFiber
    index++
  }
}

function createDom(fiber: ElementType): HTMLElement | Text {
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

  // Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      const handler = prevProps[name] as EventHandlerType
      dom.removeEventListener(eventType, handler)
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
      const handler = nextProps[name] as EventHandlerType
      dom.addEventListener(eventType, handler)
    })
}

function commitRoot() {
  deletions?.forEach(commitWork)
  commitWork(wipRoot?.child)
  currentRoot = wipRoot
  wipRoot = null
}

function commitWork(fiber: ElementType | null | undefined) {
  if (!fiber) {
    return
  }

  let domParentFiber = fiber.parent
  while (!domParentFiber?.dom) {
    domParentFiber = domParentFiber?.parent
  }
  const domParent = domParentFiber.dom
  if (fiber.dom) {
    if (fiber.effectTag === 'PLACEMENT') {
      domParent?.appendChild(fiber.dom)
    } else if (fiber.effectTag === 'DELETION') {
      commitDeletion(fiber, domParent)
    } else if (fiber.effectTag === 'UPDATE' && fiber.prev) {
      updateDom(fiber.dom, fiber.prev.props, fiber.props)
    }
  }

  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

function commitDeletion(
  fiber: ElementType | null | undefined,
  domParent: HTMLElement | Text,
) {
  if (fiber?.dom) {
    domParent.removeChild(fiber.dom)
  } else {
    commitDeletion(fiber?.child, domParent)
  }
}

requestIdleCallback(workLoop)

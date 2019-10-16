/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 * 遍历ast树寻找纯静态节点
 * 目的：
 *  1. 把他们作为常量，避免每次重新渲染都去创建新节点
 *  2. patch时跳过这些节点
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记所有非静态节点
  markStatic(root)
  // second pass: mark static roots.
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  // 初步标记是不是静态节点
  node.static = isStatic(node)
  // 对于表达式文本节点和其它节点（通过createASTElement创建的节点type都为1）
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) && // 标签是自定义的或者slot之类（组件或者slot）
      node.tag !== 'slot' && 
      node.attrsMap['inline-template'] == null 
    ) {
      return
    }
    // 遍历子节点进行静态节点的标记
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 子节点是非静态节点时，当前节点也是非静态的
      if (!child.static) {
        node.static = false
      }
    }
    if (node.ifConditions) {
      // 标记if-else条件下的块内容是否是静态的
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // node本身是静态节点，且只包含一个纯文本子节点时
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression 表达式节点，（在parse过程中）
    return false
  }
  if (node.type === 3) { // text 普通文本节点 或者 注释节点
    return true
  }
  return !!(node.pre || ( // 在pre标签下
    !node.hasBindings && // no dynamic bindings 没有动态绑定属性
    !node.if && !node.for && // not v-if or v-for or v-else 
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component 不是组件
    !isDirectChildOfTemplateFor(node) && // 不是root节点并且不在有v-for属性的节点下
    Object.keys(node).every(isStaticKey) // 节点的每个属性都是staticKey
  ))
}

// 在有v-for属性的节点下或者是template的子节点（root节点）
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}

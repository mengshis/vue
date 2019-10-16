/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

// 匹配@开头或v-on开头
export const onRE = /^@|^v-on:/
// 判断是否是指令，匹配v-或@(v-on)或:(v-bind)开头。
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/
// 匹配v-fo数值的值（通过in、of分隔），并提取of、for 前后内容
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
// 匹配（开头或者)结尾的内容，并提取除（）以外的内容
const stripParensRE = /^\(|\)$/g
// 匹配[]内的内容，判断是否是动态属性
const dynamicArgRE = /^\[.*\]$/

// 匹配指令中的参数 v-on:click="onClick"
const argRE = /:(.*)$/
// 匹配以：或者v-bind:开头的内容
export const bindRE = /^:|^\.|^v-bind:/
// 匹配以.开头的内容
const propBindRE = /^\./
// 匹配指令修饰符 v-on:click.stop
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

// 匹配v-slot(#)属性
const slotRE = /^v-slot(:|$)|^#/

const lineBreakRE = /[\r\n]/
const whitespaceRE = /\s+/g
// 匹配无效属性
const invalidAttributeRE = /[\s"'<>\/=]/

// he.decode 函数用于 HTML 字符实体的解码工作, 将被用于对纯文本的解码
const decodeHTMLCached = cached(he.decode) // &#x26; -> '&'

export const emptySlotScopeToken = `_empty_`

// configurable state
// 定义平台化选项变量: 平台化的编译器选项参数，不同平台这些变量将被初始化的值是不同的
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

/**
 * 创建一个元素的描述对象（ast树的基本组成单位）
 * @param {*} tag 标签名
 * @param {*} attrs 属性数组
 * @param {*} parent 父节点对象的引用
 */
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // 根据编译器的选项参数对平台化的变量进行了初始化
  warn = options.warn || baseWarn

  // isPreTag函数：判断标签是否是pre标签
  platformIsPreTag = options.isPreTag || no
  /**
   * mustUserProp函数：检测一个属性在标签中是否要使用元素对象原生的 prop 进行绑定 
   * 这里的 prop 指的是元素对象的属性，而非 Vue 中的 props 概念
   */
  ```
    export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
    return (
      (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
      (attr === 'selected' && tag === 'option') ||
      (attr === 'checked' && tag === 'input') ||
      (attr === 'muted' && tag === 'video')
    )
  }
  ```
  platformMustUseProp = options.mustUseProp || no
  // 获取元素(标签)的命名空间
  platformGetTagNamespace = options.getTagNamespace || no
  const isReservedTag = options.isReservedTag || no
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)
  // pluckModuleFunction函数：找出options.mudules中的所有key属性的值
  ```
   options.modules = [
     // class.js 处理class属性
    {
      staticKeys: ['staticClass'],
      transformNode, // 获取class的静态值、动态绑定值，挂到el上
      genData
    },
    // style.js 处理style属性
    {
      staticKeys: ['staticStyle'],
      transformNode, // 获取style的静态值、动态绑定值，挂到el上
      genData
    },
    // model.js 只对type属性为动态属性的input元素进行处理，做v-if-else的一个转化
    {
      preTransformNode
    }
  ]
  ```
  // transforms：获取options.modules中所有的transformNode值
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')
  /**
   * transforms，preTransforms，postTransforms 根据调用时机进行区分命名,
   * 和process一样都是对当前元素描述对象做进一步处理（在元素描述对象上添加各种各样的具有标识作用的属性）
   * 与 process* 系列函数唯一的区别就是平台化的区分
   * process 是不区分平台都需要执行的，
   * transforms，preTransforms，postTransforms 是处理对应平台下的相关逻辑的
   */

  delimiters = options.delimiters

  const stack = [] // 存储处理过的未结束的节点（存储所有非一元标签）
  // 是否放弃标签之间的空格
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  // 定义根节点（最终的ast树）
  let root
  // 当前处理节点的父节点（每遇到一个非一元标签，都会将该标签的描述对象作为 currentParent 的值）
  let currentParent
  /**
   * <pre> 标签内的解析行为与其他 html 标签是不同。具体不同体现在：
   * 1、<pre> 标签会对其所包含的 html 字符实体进行解码
   * 2、<pre> 标签会保留 html 字符串编写时的空白
   */
  // 用来标识当前解析的标签是否在拥有 v-pre 属性的标签之内: 跳过这个元素和它的子元素的编译过程，可以直接显示{{Mustache}}插值表达式，不去查找Mustache变量
  let inVPre = false
  // 标识是否在pre标签内
  let inPre = false
  // 标识是否已经触发warn
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  /**
   * 每当遇到一个标签的结束标签时，或遇到一元标签时都会调用该方法“闭合”标签
   * @param {*} element 
   */
  function closeElement (element) {
    // 去除节点后剩余空白
    trimEndingWhitespace(element)
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // tree management
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    // 当前节点有父节点，且当前节点不是script或style标签
    if (currentParent && !element.forbidden) {
      // 执行else...if的条件判断
      if (element.elseif || element.else) {
        // 如果一个标签使用 v-else-if 或 v-else 指令，
        // 那么该元素的描述对象实际上会被添加到对应的 v-if 元素描述对象的 ifConditions 数组中，而非作为一个独立的子节点，
        processIfConditions(element, currentParent)
      } else {
        // 处理slot
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        // 将当前节点添加到父节点的children数组中
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // 做数据的重置
    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 去除最后的剩余空白
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  /**
   * 遵循的原则：必须有且仅有一个根元素
   * slot插槽和template内容可能渲染多个节点，而且template本身是不渲染的
   * @param {*} el 
   */
  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    // 一个元素，不能有v-for
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug: http://osgeo-org.1560.x6.nabble.com/WFS-and-IE-11-td5090636.html
      /* istanbul ignore if */
      /**
       * ie11下，svg 标签中会渲染多余的属性
       * <svg xmlns:feature="http://www.openplans.org/topp"></svg> 
       * 会被渲染为 
       * <svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
       * 多了xmlns:NS1="" NS1:这一串，
       * guardIESVGBugd对这个进行了修正
       */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        // 是否输出源码位置？
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        // 属性名称校验(是否合法，不能包含空格、引号等等)
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      // isForbiddenTag：判断是否是非style和script标签
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      // 对元素执行所有preTransforms方法
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }
      // 当前标签不是在有v-pre属性的标签内
      if (!inVPre) {
        // processPre： 判断当前标签自身是否有v-pre属性，如果有v-pre属性，设置element.pre为true
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      // Processed值：元素是否已被处理过，防止被重复处理
      // 在preTransforms数组中的处理函数里被添加（src/platforms/web/compiler/modules/model.js）
      } else if (!element.processed) {
        // structural directives 结构化指令
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          // 校验当前节点是否符合根节点要求
          checkRootConstraints(root)
        }
      }

      // 判断是否是非一元标签
      if (!unary) {
        // 将currentParent设为当前节点
        currentParent = element
        // 在stack中存储当前节点
        stack.push(element)
      } else {
        closeElement(element)
      }
    },

    end (tag, start, end) {
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1
      // 每当遇到一个非一元标签的结束标签时，都将 currentParent 变量的值回退到之前的元素描述对象，保证当前正在解析的标签拥有正确的父级
      //
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)
    },

    chars (text: string, start: number, end: number) {
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          ```
            <template>
              我是文本节点
            </template>
          ```
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            ```
              文本节点在根元素的外面
              <template>
                <div>根元素内的文本节点</div>根元素外的文本节点
              </template>
            ```
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      // 解决 IE 浏览器中渲染 <textarea> 标签的 placeholder 属性时存在的 bug 
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      // 在pre标签内或者text除空格外还有内容
      if (inPre || text.trim()) {
        ```
          <pre>
            &lt;div&gt;我是一个DIV&lt;/div&gt;
          </pre>
        ```
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        // 去除文本内空格
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        // parseText: 处理字面量表达式，没有时返回空
        /**
            '我的名字叫：{{name}},{{age}}岁'
          解析为
            {
              expression: '"我的名字叫："+_s(name)+","+_s(age)+"岁"',
              tokens: [
                "我的名字叫：",
                {"@binding":"name"},
                ",",
                {"@binding":"age"},
                "岁"
              ]
            }
         */
        // 表达式文本节点
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        // text不为空，或父节点没有子节点，或父节点的最后一个子节点不是空格
        // 普通文本节点
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    comment (text: string, start, end) {
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        // 和普通文本节点一样，但isComment为true
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

function processPre (el) {
  // 获取当前标签的v-pre属性
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}
/**
 * 将该元素所有属性全部做完原生属性处理
 */
function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    // 遍历提取attrsList中的属性加到attrs中
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        // 通过stringify保证最终生成的代码中 el.attrsList[i].value 属性始终被作为普通的字符串处理
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    ```
      <div v-pre>
        <span></span>
      </div>
    ```
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

/**
 * 其他一系列 process* 函数的集合
 * @param {*} element 
 * @param {*} options 
 */
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 当结构化的属性(structural attributes)被移除之后，检查该元素是否是“纯”的。
  // 结构化属性：v-for、v-if、v-once
  // 只有当标签没有key属性，并且标签只使用了结构化指令的时才被认为是“纯”的，此时会将元素的 plain 属性设置为 true
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  processRef(element)
  processSlotContent(element)
  processSlotOutlet(element)
  processComponent(element)
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element)
  return element
}

/**
 * 对元素的key属性进行处理
 * 1、key 属性不能被应用到 <template> 标签。
 * 2、使用了 key 属性的标签，其元素描述对象的 el.key 属性保存着 key 属性的值。
 * @param {*} el 
 */
function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    // 判断ref属性使用是否在v-for指令内
    // 如果 ref 属性存在于 v-for 指令之内，我们需要创建一个组件实例或DOM节点的引用数组，而不是单一引用，这个时候就需要 el.refInFor 属性来区分
    ```
      <div v-for="obj of list" :ref="obj.id"></div>
      
      <div v-for="obj of list">
        <div :ref="obj.id"></div>
      </div>
    ```
    el.refInFor = checkInFor(el)
  }
}

export function processFor (el: ASTElement) {
  let exp
  // (obj, ind, ind2) in list
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    // { for: 'list', alias: 'obj', iterator1: 'ind' }
    const res = parseFor(exp)
    if (res) {
      // extend: 将 res 常量中的属性混入当前元素的描述对象中
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

/**
 * 对v-for属性的值进行parse
 * @param {*} exp 
 * e.g.   (obj, ind) in list
 */
export function parseFor (exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE)
  /**
   * inMatch = [
      '(obj, ind) in list',
      '(obj, ind)',
      'list'
    ]
   */
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim() // 'list'
  const alias = inMatch[1].trim().replace(stripParensRE, '') // (obj, ind) => obj, ind
  const iteratorMatch = alias.match(forIteratorRE) 
  /**
    iteratorMatch = [
      ', ind',
      ' ind',
      undefined
    ]
   */
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim() // res.alias = 'obj'
    res.iterator1 = iteratorMatch[1].trim() // ind
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    res.alias = alias
  }
  /**
    res = {
      for: 'list',
      alias: 'obj',
      iterator1: 'ind'
    }
   */
  return res
}

/**
  <div v-if="a"></div>
process后
  {
    type: 1,
    tag: 'div',
    ifConditions: [
      {
        exp: 'a',
        block: { type: 1, tag: 'div'  }
      }
    ]
  }
*/
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  // 如果没有写v-if指令的属性值，这个v-if指令不生效
  if (exp) {
    el.if = exp
    // 将条件加到el.ifConditions中
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

```
  <div v-if="a"></div>
  <p v-else-if="b"></p>
  <span v-else></span>
```
// process后div的ast树
```
  {
    type: 1,
    tag: 'div',
    ifConditions: [
      {
        exp: 'a',
        block: { type: 1, tag: 'div' /* 省略其他属性 */ }
      },
      {
        exp: 'b',
        block: { type: 1, tag: 'p' /* 省略其他属性 */ }
      },
      {
        exp: undefined,
        block: { type: 1, tag: 'span' /* 省略其他属性 */ }
      }
    ]
    // 省略其他属性...
  }
```
function processIfConditions (el, parent) {
  // 获取相邻的前一个同级节点
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    // 将elseif属性加入到同级节点中
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

/**
 * 查找上一个节点
 * @param {*} children 
 */
function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

/**
 * 将具有v-else-if 或 v-else 属性的元素的描述对象添加到具有 v-if 属性的元素描述对象的 .ifConnditions 数组
 * @param {*} el 
 * @param {*} condition 
 */
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
// 处理插槽内容
function processSlotContent (el) {
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}
/**
 * 处理组件，使用了is或inline-template
 * inline-template: https://cn.vuejs.org/v2/guide/components-edge-cases.html#%E5%86%85%E8%81%94%E6%A8%A1%E6%9D%BF
 * @param {*} el 
 */
function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    // 指令匹配 name = 'v-bind:some-prop.sync'
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // parseModifiers 解析修饰符: v-bind:some-prop.sync => { sync: true }
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      // to do...
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      // name = "v-bind:some-prop"
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '')
        // name = 'some-prop'
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
        // 如果是动态属性[some-prop],处理获得some-prop
          name = name.slice(1, -1)
        }
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          // 使用了 prop 修饰符，则意味着该属性将被作为原生DOM对象的属性
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          // 将绑定的属性驼峰化
          // 不直接将属性写成驼峰的原因：
          // <svg :viewBox="viewBox"></svg>
          // 对于浏览器来讲，真正的属性名字是 :viewBox 而不是 viewBox，
          // 所以浏览器在渲染时会认为这是一个自定义属性，对于任何自定义属性浏览器都会把它渲染为小写的形式
          // => <svg viewbox="viewBox"></svg>
          // 正确写法：<svg :view-box.camel="viewBox"></svg>
          // ？？？这个问题仅存在于 Vue 需要获取被浏览器处理后的模板字符串时才会出现，使用了 template 选项代替 Vue 自动读取 或使用单文件组件 不会出现
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            // 使用sync 修饰符的绑定属性等价于多了一个事件侦听，并且事件名称为 'update:${驼峰化的属性名}'
            // genAssignmentCode: 返回代码字符串,进行赋值
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              // addHandler: 将事件名称与该事件的侦听函数添加到元素描述对象的 el.events 属性或 el.nativeEvents 属性中
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          // platforms/web/util mustUseProp: 检测一个属性在标签中是否要使用元素对象原生的 prop 进行绑定
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          // addProp 函数与 addAttr 函数类似，只不过 addProp 函数会把属性的名字和值以对象的形式添加到元素描述对象的 el.props 数组中
          // 元素描述对象的 el.props 数组中存储的并不是组件概念中的 prop，而是原生DOM对象的属性
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on 处理v-on指令
        name = name.replace(onRE, '')
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        //处理剩余指令: v-text、v-html、v-show、v-cloak、 v-model 以及其他自定义指令
        // name = 'v-directive:arg'
        name = name.replace(dirRE, '') 
        // name = 'directive:arg'
        // parse arg
        const argMatch = name.match(argRE) // 获取指令参数，冒号后面内容
        let arg = argMatch && argMatch[1] // 'arg'
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1)) // 获得指令名称：directive
          if (dynamicArgRE.test(arg)) { // 动态
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        // 在el.directives里加入当前指令。
        // rawName: 未处理前的name 'v-directive:arg'
        ```
          el.directives = [
            {
              name: 'directive',
              rawName: 'v-directive:arg.once' 
              value: '',
              arg: 'arg',
              modifiers: {
                once: true
              }
            }
          ]
        ```
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute 处理剩余非指令属性，比如 id、width 等
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      // 增加到el.attrs数组中，
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      /**
       * 元素描述对象的 el.attrs 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中使用 setAttribute 方法将属性添加到真实DOM元素上，
       * 而在火狐浏览器中存在无法通过DOM元素的 setAttribute 方法为 video 标签添加 muted 属性的问题，
       * 所以下列代码就是为了解决该问题的，
       * 其方案是如果一个属性的名字是 muted 并且该标签满足 platformMustUseProp 函数(video 标签满足)，
       * 则会额外调用 addProp 函数将属性添加到元素描述对象的 el.props 数组中。
       * 这是因为元素描述对象的 el.props 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中直接使用真实DOM对象添加
       */
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

/**
 * 判断当前节点的祖先节点是否有v-for属性
 * @param {*} el 
 */
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  // 获得修饰符 v-on:click.stop => ['.stop']
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    // { stop: true }
    return ret
  }
}

/**
 * 将属性数组的每个属性元素由{ name: 'class', value: 'common_wrapper' } 转化为 { 'class': 'common_wrapper' }
 * @param {*} attrs 
 */
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}
/**
 * 禁止的标签是：
 * 1、<style> 标签为被禁止的标签
 * 2、没有指定 type 属性或虽然指定了 type 属性但其值为 text/javascript 的 <script> 标签被认为是被禁止的
 */
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

/**
 * 从使用了 v-model 指令的标签开始，逐层向上遍历父级标签的元素描述对象，直到根元素为止。
 * 并且在遍历的过程中一旦发现这些标签的元素描述对象中存在满足条件：_el.for && _el.alias === value 的情况，就会打印警告信息
 * _el.for && _el.alias === value: 使用了 v-model 指令的标签或其父代标签使用了 v-for 指令
 * @param {*} el 
 * @param {*} value 
 */
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}

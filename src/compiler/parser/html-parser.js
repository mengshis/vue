/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// attribute: 用来匹配标签的属性(attributes)
/**
  const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
  console.log('class="some-class"'.match(attribute))  // 测试双引号
  console.log("class='some-class'".match(attribute))  // 测试单引号
  console.log('class=some-class'.match(attribute))  // 测试无引号
  console.log('disabled'.match(attribute))  // 测试无属性值
 */
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
/**
 * 动态属性值（如包今@、:、v-等等Vue专有的）的匹配
 * :[class]="test"
 */
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
/**
 * 不包含前缀的XML标签名
 */
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
/**
 * qname合法的标签名称
 */
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 开始标签 <tag 
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 开始标签关闭 />
const startTagClose = /^\s*(\/?)>/
// 结束标签 </tag>
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
// 注释
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
// 检测给定的标签名字是不是纯文本标签
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992 解决一个历史遗留问题https://github.com/vuejs/vue/issues/5992
// 一些元素会受到额外的限制，
//比如 <pre> 标签和 <textarea> 会忽略其内容的第一个换行符，以上是浏览器的行为，所以 Vue 的编译器也要实现这个行为，避免出现其他不可预期的行为
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 是否忽略第一个换行符
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 解码 html 实体
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  const stack = [] // 遇到非一元标签时，将该标签push进去。用来判断非一元标签是否缺少结束标签
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0 // 当前字符流的读入位置
  let last, lastTag // last存储剩余还未parse的html字符串，lastTag存储stack栈顶元素
  // 开启循环，直到html被parse完
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 对纯文本标签和非纯文本标签区分处理
    // !（lastTag && isPlainTextElement(lastTag)）最近一次遇到的非一元标签不是纯文本标签
    // parse非纯文本标签内的内容
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // html 字符串中左尖括号(<)第一次出现的位置
      let textEnd = html.indexOf('<')
      // 第一个字符就是<
      if (textEnd === 0) {
        // Comment:
        // 判断是否是注释节点
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')
          // 判断是否有注释结尾
          if (commentEnd >= 0) {
            // 是否保留注释
            if (options.shouldKeepComment) {
              // 最终获取到的内容是不包含注释节点的起始(<!--)和结束(-->)
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 将已经 parse 完毕的字符串剔除
            advance(commentEnd + 3)
            // continue跳过此次循环，开启下一次parse
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 判断是否是条件注释节点
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag: 结束标签
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag: 开始标签
        const startTagMatch = parseStartTag() // 若存在，返回开始标签parse后的对象 { tagName: 'div', attrs: [ [' class="test"', 'class', '=', 'test', ],[...] ] }
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          // 判断并剔除第一个换行符
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        // 截取<开始后的部分
        rest = html.slice(textEnd)
        // 判断这部分是否是开始标签，结束标签或者注释节点
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 获取剩余内容中除开始的<以外<的位置
          next = rest.indexOf('<', 1)
          if (next < 0) break
          // 文本结束位置加上这部分长度
          textEnd += next
          // 截取textEnd后的部分
          rest = html.slice(textEnd)
        }
        // 文本内容
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        text = html
      }

      // 剔除文本内容的位置
      if (text) {
        advance(text.length)
      }
      // 调用chars钩子，文本处理
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 处理纯文本标签中的内容
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // reStackedTag：匹配纯文本标签的内容以及结束标签的
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 如果两个相等，说明html是纯文本
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 剔除html前n个字符
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // e.g. html = '<div class="test" @click="onClick">content</div>'
  function parseStartTag () {
    const start = html.match(startTagOpen) // ['<div', 'div']
    if (start) {
      const match = {
        tagName: start[1],// 标签名称 div
        attrs: [],
        start: index
      }
      advance(start[0].length) //<+标签的长度，剔除 => html = 'class="test" @click="onClick">content</div>'
      let end, attr
      // 没有匹配到开始标签的结束部分,且匹配到了属性
      /**
       * begin:
       *    html = 'class="test" @click="onClick">content</div>'
       * loop 1:
       *    attr = [' class="test"', 'class', '=', 'test']
       *    html = ' @click="onClick">content</div>'
       * loop 2:
       *    attr = [' @click="onClick"', '@click', '=', 'onClick']
       *    html = '>content</div>'
       * loop 3:
       *    end = ['>', ''] //匹配到开始标签的结束部分 或者 匹配不到属性 的时候循环停止
       * end
       */
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 存在开始标签的结束部分时，才返回match对象
      if (end) {
        match.unarySlash = end[1] // 仅一元标签有值，（br\input）
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash
    // expectHTML 是为了处理一些异常情况，比如p中存在div
    if (expectHTML) { 
      // p标签且段落式内容 e.g. <p><div></div></p>
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        // 强行闭合p标签 => <p></p><div></div></p> 之后stack处理遇到最后那个</p>结束标签会通过parseEndTag进行补全，=> <p></p><div></div><p></p>
        parseEndTag(lastTag)
      }
      // 当前tag是可以省略结束标签的标签，并且上一个标签和当前标签是同一种，会关闭当前标签
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }
    
    /**
     * 是否是一元标签
     * isUnaryTag: html中规定的一元标签
     * unarySlash: 通过开始标签的结束部分是否有/标识，e.g. 自定义标签（自定义组件）
     */
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) { 
      
      // args = [' @click="onClick"', '@click', '=', 'onClick'] => {
      //   name: '@click',
      //   value: 'onClick'
      // }
      const args = match.attrs[i]
      // 获取attr的value，
      // 根据attribute和dynamicArgAttribute这两个正则可以看出value在match后结果数组的3、4、5位置，key在1
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // 属性名称
        value: decodeAttr(value, shouldDecodeNewlines) // 属性值
      }
      // 非生产环境下，给属性加上在字符串字节流中的开始和结束位置
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length // 去除空白后的开始位置
        attrs[i].end = args.end
      }
    }

    // 如果是非一元标签
    if (!unary) {
      // 推入栈内，设置lastTag为当前标签
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    // 调用parser钩子函数
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  /**
   * 1. 检测是否缺少闭合标签
   * 2. 处理 stack 栈中剩余的标签
   * 3. 解析 </br> 与 </p> 标签，与浏览器的行为相同
   * @param {*} tagName 
   * @param {*} start 
   * @param {*} end 
   */
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 从stack末端开始找同样的tag
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop 没找到
      pos = 0
    }
    
    // 找到了当前标签的最近开始标签
    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 遍历pos和stack末端之间的tag，提示这部分标签未正常结束
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        // 执行parser的end钩子, 将其闭合，保证解析结果的正确性
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 从stack中移除当前pos之后的标签
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    // 对br、p标签特殊处理，fix解析
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}

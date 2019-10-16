/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}
// 文本解析，处理文本节点中可能包含的字面量表达式 {{}}
// e.g. '我的名字叫：{{name}},{{age}}岁'
export function parseText (
  text: string,
  delimiters?: [string, string] // 自定义模板符号，默认是{{}}
): TextParseResult | void {
  // 解析正则
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 没有
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    /**
      match = {
        0: '{{name}}',
        1: 'name',
        groups: undefined,
        index: 6,
        input: '我的名字叫：{{name}}'
      }
    
     */
    index = match.index // 6
    // push text token
    // 处理当前表达式前的文本内容：'我的名字叫：'
    if (index > lastIndex) {

      rawTokens.push(tokenValue = text.slice(lastIndex, index)) // '我的名字叫：'
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    const exp = parseFilters(match[1].trim()) // 'name'
    tokens.push(`_s(${exp})`) // '_s(name)'
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length // 14
  }
  // 处理剩余的文本内容：'岁'
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  ```
    {
      expression: '"我的名字叫："+_s(name)+","+_s(age)+"岁"',
      tokens: [
        "我的名字叫：",
        {"@binding":"name"},
        ",",
        {"@binding":"age"},
        "岁"]
    }
  ```
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}

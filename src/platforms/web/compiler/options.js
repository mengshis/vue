/* @flow */

import {
  isPreTag, //检查给定的标签是否是 pre 标签, tag === 'pre' ??
  mustUseProp, // 用来检测一个属性在标签中是否要使用元素对象原生的 prop 进行绑定 http://caibaojian.com/vue-design/appendix/web-util.html#mustuseprop
  isReservedTag, // 检查是否是保留标签（html原生标签）
  getTagNamespace // 获取元素(标签)的命名空间 http://caibaojian.com/vue-design/appendix/web-util.html#gettagnamespace
} from '../util/index'

import modules from './modules/index' 
import directives from './directives/index' // 一些自带的指令，v-model/v-html/v-text
import { genStaticKeys } from 'shared/util' // 根据编译器(compiler)的 modules 生成一个静态键字符串。
// isUnaryTag: 是否是一元标签
// canBeLeftOpenTag: 自己补全并闭合的标签
import { isUnaryTag, canBeLeftOpenTag } from './util' 
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag,
  isUnaryTag,
  mustUseProp,
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules)
}

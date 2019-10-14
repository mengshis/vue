/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

/**
 * 定义Vue全局的一些全局属性和工具方法
 * 
 */
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set             // 全局的set方法
  Vue.delete = del          // 全局的del方法
  Vue.nextTick = nextTick   // 全局的nextTick方法

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  extend(Vue.options.components, builtInComponents)

  initUse(Vue)              // Vue.use方法用来加载工具和对象
  initMixin(Vue)            // 将
  initExtend(Vue)
  initAssetRegisters(Vue)
}

/**
  Vue.config 各种全局配置项
  Vue.util 各种工具函数，还有一些兼容性的标志位（哇，不用自己判断浏览器了，Vue已经判断好了）
  Vue.set/delete 这个你文档应该见过
  Vue.nextTick
  Vue.options 这个options和我们上面用来构造实例的options不一样。这个是Vue默认提供的资源（组件指令过滤器）。
  Vue.use 通过initUse方法定义
  Vue.mixin 通过initMixin方法定义
  Vue.extend 通过initExtend方法定义
*/

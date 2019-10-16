/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean // hydrating与服务器渲染(SSR)相关的，是否直接使用服务端渲染的DOM元素,浏览器端可以不用管;
): Component {
  // 获取dom节点
  el = el && query(el)

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 判断render方法，自己写的rennder函数不走编译环节
  if (!options.render) {
    // 提供template属性
    let template = options.template
    /**
     * 获取渲染的模板内容template
     */
    if (template) {
      // 可以是id选择器或字符串
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          // id选择器
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      // 也可以是node
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 获取el节点的outerHTML内容
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      /** 性能 */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      /**
       * 将template编译成render函数，返回render和staticRenderFns
       * render: 运行后返回VNode节点，供页面的渲染以及在update的时候patch
       * staticRenderFns: 优化，提取那些后期不用去更新的节点（一些静态节点）
       */
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        // http://caibaojian.com/vue-design/appendix/web-util.html#compat-js-%E6%96%87%E4%BB%B6
        shouldDecodeNewlines, // 在浏览器中，编译模板时对属性值中的换行符或制表符进行处理
        shouldDecodeNewlinesForHref, // 在浏览器中，编辑模板时，对a标签中的href属性中的换行符或制表符做兼容处理
        // options: 当前vue实例的$options属性
        delimiters: options.delimiters, 
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue

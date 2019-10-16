/* @flow */
/**
 * 1、缓存编译结果，通过 createCompileToFunctionFn 函数内声明的 cache 常量实现。
 * 2、调用 compile 函数将模板字符串转成渲染函数字符串
 * 3、调用 createFunction 函数将渲染函数字符串转成真正的渲染函数
 * 4、打印编译错误，包括：模板字符串 -> 渲染函数字符串 以及 渲染函数字符串 -> 渲染函数 这两个阶段的错误
 */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

/**
 * 
 * @param {*} code 函数体字符串
 * @param {*} errors 用来收集创建function时的错误
 */
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

export function createCompileToFunctionFn (compile: Function): Function {
  // 创建缓存
  const cache = Object.create(null)

  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    //处理选项参数 options 并定义 warn 常量
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      /**
       * 非生产环境下，检测 new Function() 是否可用，
       * 如果有错误发生且错误的内容中包含诸如 'unsafe-eval' 或者 'CSP' 这些字样的信息时就会给出一个警告
       */
      try {
        new Function('return 1')
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    /**
     * options.delimiters 是一个数组，
     * 如果 options.delimiters 存在，
     * 则使用 String 方法将其转换成字符串并与 template 拼接作为 key 的值，
     * 否则直接使用 template 字符串作为 key 的值，
     * 然后判断 cache[key] 是否存在，如果存在直接返回 cache[key]
     * 
     * 目的是: 缓存字符串模板的编译结果，防止重复编译，提升性能
     */
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      return cache[key]
    }

    // compile
    const compiled = compile(template, options)
    // compiled: 平台编译器对模板的编译结果，包含模板编译后的抽象语法树ast
    /**
      {
        ast,
        render: code.render, // `with(this){return ${code}}`
        staticRenderFns: code.staticRenderFns // ['with(this){return xxxx}']
      }
    */

    // check compilation errors/tips
    // 非生产环境下，检查编译过程中的错误和提示信息
    if (process.env.NODE_ENV !== 'production') {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {} // 最终返回值
    const fnGenErrors = [] // 收集创建渲染函数时产生的错误信息
    // compiled.render: compile 函数编译模板字符串后所得到的是字符串形式的函数体
    res.render = createFunction(compiled.render, fnGenErrors) //渲染函数
    // 渲染优化
    res.staticRenderFns = compiled.staticRenderFns.map(code => { //
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // 非生产环境下，输出生成渲染函数过程中的错误fnGenErrors
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }
    // 返回结果并缓存
    return (cache[key] = res)
  }
}

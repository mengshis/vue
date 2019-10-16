/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

/**
 * createCompiler： 创建编译器
 * 
 * compile: 编译器，将template转为ast、render、和staticRenderFns，生成字符串形式的代码
 * compileToFunctions: 带缓存的编译器，生成可执行的代码
 */
const { compile, compileToFunctions } = createCompiler(baseOptions) 

export { compile, compileToFunctions }

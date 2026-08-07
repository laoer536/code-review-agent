# TypeScript 规范

## 类型安全
- 禁止使用 any，用 unknown 或具体类型替代
- 优先使用 interface 而非 type（除了联合类型和交叉类型）
- 函数返回值必须显式标注类型
- 使用 as const 断言常量对象

## 常见问题
- 避免 as 类型断言，优先用类型守卫
- 不要使用 ! 非空断言，用可选链 ?. 和空值合并 ??
- 枚举优先使用 const enum 或字面量联合类型

## 导入规范
- 使用 import type 导入纯类型
- 避免 default export，优先 named export
- 第三方库导入放最前，本地导入放最后

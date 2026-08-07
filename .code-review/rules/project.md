# 项目专属规则

## 代码风格
- 使用 Bun API 优先，避免 Node.js 兼容层
- 使用 `Bun.file` 替代 `fs.readFile`
- 使用 `Bun.$` 替代 `child_process`
- 模板字符串中的 git 命令参数需要校验（防止注入）

## 错误处理
- 工具函数内部不吞异常，由调用方决定是否 catch
- catch 块必须记录日志，不允许空 catch

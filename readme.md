# @dgck81lnn/koishi-plugin-auto-delete-response

[![npm](https://img.shields.io/npm/v/@dgck81lnn/koishi-plugin-auto-delete-response?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-auto-delete-response)

本插件提供了一个 `autoDeleteResponse` 服务，使用该服务代替 `session.send()` 发送消息，可使机器人在用户的消息被删除（撤回）时自动删除（撤回）发出的响应消息。

## 配置

### `timeout`

通过 `autoDeleteResponse.send()` 发送响应及本插件的上下文过滤器内任何消息被删除的记录的时间限制，单位为毫秒。

## 用法

### `ctx.autoDeleteResponse.send(session: Session, fragment: Element.Fragment, options?: Universal.SendOptions): Promise<string[]>`

替代 `session.send(fragment, options)` 使用。当引发本会话的消息被用户删除时，机器人会自动删除对应的所有通过此方法发出的消息。若调用本方法时，引发本会话的消息已在近期被删除，则会自动放弃发送。

### `ctx.autoDeleteResponse.action(action: Command.Action): Command.Action`

用于包装指令的 `action` 回调函数。若本次指令调用为根调用（`argv.root` 为真；本次指令调用是由消息会话直接引发，而非通过 `session.execute()` 手动发起），则会将 `action` 的返回值（或抛出的 `SessionError`）用 `autoDeleteResponse.send()` 发送。目前不会处理 `SessionError` 以外的异常，因此“发生未知错误”的提示信息并不会被自动撤回。

## 示例

1.  ~~~javascript
    ctx.middleware(async (session, next) => {
      if (session.content === "天王盖地虎") {
        await ctx.sleep(5000)
        ctx.autoDeleteResponse.send(session, "宝塔镇河妖")
        return
      }
      return next()
    })
    ~~~

    收到“天王盖地虎”时，机器人延迟 5 秒后通过本服务回复“宝塔镇河妖”。若在发送前 `timeout` 时间内用户撤回了这条“天王盖地虎”，则这次 `ctx.autoDeleteResponse.send()` 将会失效，“宝塔镇河妖”不会实际发送出去；若在“宝塔镇河妖”发送后 `timeout` 时间内用户撤回这条“天王盖地虎”，则机器人也会撤回“宝塔镇河妖”。

2.  ~~~javascript
    ctx.command("echo <text:text>")
      .action(ctx.autoDeleteResponse.action(({ session }, text) => {
        if (!text) throw new SessionError(".expect-text")
        return h.text(text)
      }))

    ctx.i18n.define("zh-CN", "commands.echo", {
      description: "输出给定文本",
      messages: {
        "expect-text": "缺少文本。",
      },
    })
    ~~~

    一个简单的 echo 指令，当用户撤回指令消息时，使机器人也撤回响应。但若用户使用插值语法（如 `other-command $(echo text)`）等方法间接调用该指令，则不会触发该机制。

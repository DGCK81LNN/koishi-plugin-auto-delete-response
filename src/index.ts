import { Channel, Command, Context, Dict, Schema, Service, Session, User } from "koishi"

declare module "koishi" {
  interface Context {
    autoDeleteResponse: AutoDeleteResponse
  }
}

function getKey(session: Session) {
  return `${session.platform}:${session.selfId}:${session.channelId}:${session.messageId}`
}

class AutoDeleteResponse extends Service {
  private _responses: Dict<Promise<string[] | undefined>>

  constructor(ctx: Context, public config: AutoDeleteResponse.Config) {
    super(ctx, "autoDeleteResponse", true)
    this._responses = Object.create(null)

    ctx.on("message-deleted", async session => {
      const key = getKey(session)
      if (!(key in this._responses)) return
      const sent = await this._responses[key].catch(() => undefined)
      delete this._responses[key]
      if (!sent) return
      for (const messageId of sent) {
        try {
          await session.bot.deleteMessage(session.channelId, messageId)
        } catch (err) {
          ctx.logger.error(err)
        }
      }
    })
  }

  send(session: Session, ...sendArgs: Parameters<Session["send"]>) {
    const sent = session.send(...sendArgs)
    const key = getKey(session)
    this._responses[key] = sent
    let stop = () => {
      stop = null
      delete this._responses[key]
      disposeTimeout?.()
    }
    const disposeTimeout =
      this.config.timeout > 0
        ? this.ctx.setTimeout(stop, this.config.timeout)
        : null
    return sent.then(
      mids => {
        if (!mids) stop?.()
      },
      r => {
        stop?.()
        return Promise.reject(r)
      }
    )
  }

  action<
    U extends User.Field = never,
    G extends Channel.Field = never,
    A extends any[] = any[],
    O extends {} = {}
  >(action: Command.Action<U, G, A, O>): Command.Action<U, G, A, O> {
    return async (argv, ...args) => {
      const result = await action(argv, ...args)
      if (result && argv.root) return this.send(argv.session, result)
      return result
    }
  }
}

namespace AutoDeleteResponse {
  export interface Config {
    timeout: number
  }

  export const Config: Schema<Config> = Schema.object({
    timeout: Schema.natural()
      .default(300000)
      .description("自动撤回的默认有效时间。小于或等于 0 则永不超时（不推荐）。"),
  })
}

export default AutoDeleteResponse

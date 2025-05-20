import { Channel, Command, Context, Element, Schema, Service, Session, SessionError, Time, User } from "koishi"

declare module "koishi" {
  interface Context {
    autoDeleteResponse: AutoDeleteResponse
  }
}

function getKey(session: Session) {
  return `${session.platform}:${session.selfId}:${session.channelId}:${session.messageId}`
}

const name = "auto-delete-response"

class AutoDeleteResponse extends Service {
  private _deleted = new Map<string, () => void>()
  private _requests = new Map<string, () => Promise<void>>()

  constructor(ctx: Context, public config: AutoDeleteResponse.Config) {
    super(ctx, "autoDeleteResponse", true)
    ctx.on("message-deleted", async session => {
      const key = getKey(session)
      ctx.logger(name).debug("message %o deleted", key)
      if (this._requests.has(key)) {
        await this._requests.get(key)()
      } else {
        const stop = () => {
          ctx.logger(name).debug("forget deleted message %o", key)
          this._deleted.delete(key)
        }
        const disposeTimeout = ctx.setTimeout(stop, this.config.timeout)
        this._deleted.set(key, () => {
          disposeTimeout()
          this._deleted.delete(key)
        })
      }
    })
  }

  send(session: Session, ...sendArgs: Parameters<Session["send"]>): Promise<string[]> {
    const key = getKey(session)

    if (
      (Array.isArray(sendArgs[0]) || typeof sendArgs[0] === "string") &&
      !sendArgs[0].length
    ) {
      this.ctx.logger(name).debug("empty response for request message %o", key)
      return Promise.resolve([])
    }

    if (this._deleted.has(key)) {
      this.ctx.logger(name).debug("cancel sending response because request message %o was recently deleted", key)
      this._deleted.get(key)()
      return Promise.resolve([])
    }

    const sent = session.send(...sendArgs)
    const stop = () => {
      this.ctx.logger(name).debug("forget request message %o", key)
      this._requests.delete(key)
      disposeTimeout()
    }
    const disposeTimeout = this.ctx.setTimeout(stop, this.config.timeout)

    this._requests.set(key, async () => {
      const mids = await sent.catch(() => undefined)
      if (!mids) return
      this.ctx.logger(name).debug("delete response messages %o for request message %o", mids, key)
      this._requests.delete(key)
      disposeTimeout()
      for (const messageId of mids) {
        try {
          await session.bot.deleteMessage(session.channelId, messageId)
        } catch (err) {
          this.ctx.logger(name).warn(err)
        }
      }
    })

    return sent.then(
      mids => {
        if (!mids?.length) {
          this.ctx.logger(name).debug("nothing sent for request message %o", key)
          stop()
        }
        this.ctx.logger(name).debug("sent response messages %o for request message %o", mids, key)
        return mids
      },
      r => {
        this.ctx.logger(name).debug("failed to send response for request message %o", key, r)
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
      if (!argv.root) return action(argv, ...args)
      const result = await Promise.resolve(action(argv, ...args)).catch(err => {
        if (err instanceof SessionError) return argv.session.i18n(err.path, err.param)
        throw err
      })
      if (result) this.send(argv.session, result)
    }
  }
}

namespace AutoDeleteResponse {
  export interface Config {
    timeout: number
  }

  export const Config: Schema<Config> = Schema.object({
    timeout: Schema.natural()
      .default(5 * Time.minute)
      .description("自动撤回的有效时间。"),
  })
}

export default AutoDeleteResponse

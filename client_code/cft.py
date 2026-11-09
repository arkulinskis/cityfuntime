"""City Fun Time's JavaScript engine (theme/assets/cft-*.js + three.min.js, glued by cft-kit.js = window.CFT) seen
from Python. Pages reach the engine only through this module:

    cft.setup()            once at start-up: the server bridge the engine uses (window.CFT_HOST)
    cft.set_me(me)         after sign in / out: whose save the engine reads and writes
    cft.prepare()          load the game content + rules and the player's save (Life, Quests, Album)
    cft.view(name, arg)    a plain-JSON view of the save for a page: "life", "quests" (arg = filter),
                           "mission" (arg = mission id), "album"
    cft.track(id)          follow a mission in the game (saved at once)
    cft.mount_game(el, exit, reload)   the 3D game in a DOM node (Components/Game); returns a controller with destroy()
"""
import json

import anvil
import anvil.js
import anvil.server
from anvil.js import window

NULL = anvil.js.call(window.Function("return null"))  # "no JS object yet", typed for the validator


def _host_call(fn, args_json, quiet):
    """Called from JS (CFT.api). Always returns JSON text: {"result": ...} or {"error": "..."}."""
    args = json.loads(args_json) if args_json else []
    try:
        call = anvil.server.call_s if quiet else anvil.server.call
        r = call(fn, *args)
        if isinstance(r, dict) and r.get("ok") is False:
            return json.dumps({"error": r.get("error") or "Something went wrong"})
        return json.dumps({"result": r})
    except Exception as e:
        if type(e).__name__ == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again."})
        return json.dumps({"error": str(e) or type(e).__name__})


def setup():
    window.CFT_HOST = anvil.js.new(window.Object)
    window.CFT_HOST.call = _host_call


def set_me(me):
    window.CFT.me = window.JSON.parse(json.dumps(me)) if me else None
    window.CFT.adopt = None
    window.CFT.save = None


def prepare():
    """Loads the content scripts and the save. A JS promise returned to Python is already awaited."""
    window.CFT.prepare()


def view(name, arg=None):
    return json.loads(window.CFT.viewJSON(name, arg))


def track(mission_id):
    return bool(window.CFT.track(mission_id))


def mount_game(node, exit_fn, reload_fn):
    hooks = anvil.js.new(window.Object)
    hooks.exit = exit_fn
    hooks.reload = reload_fn
    return window.CFT.mountGame(node, hooks)

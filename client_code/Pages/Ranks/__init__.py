from anvil import *

from ._anvil_designer import RanksTemplate
from ... import router, state

BOARDS = ["worth", "level", "turfs", "missions"]


def money(n):
    n = int(round(n or 0))
    return ("-$" if n < 0 else "$") + "{:,}".format(abs(n))


def value(board, e):
    if board == "worth":
        return money(e.get("worth"))
    if board == "level":
        return "Lv %s" % e.get("level")
    if board == "turfs":
        return "%s 🏳️" % e.get("turfs")
    return "%s 📜" % e.get("missions")


class Ranks(RanksTemplate):
    """#ranks/<worth|level|turfs|missions>: the public leaderboard (top 15 per board + your own rank). Shows only the
    names players chose in the game."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.board = args[0] if args and args[0] in BOARDS else "worth"
        self.data = state.call("leaderboard") or {}
        self.players.text = str(self.data.get("players", 0))
        self.missions.text = "{:,}".format(self.data.get("missions_done", 0) or 0)
        self.turfs.text = str(self.data.get("turfs_won", 0))
        self.guest_note.visible = not state.me()
        self._draw()

    def _draw(self):
        rows = self.data.get(self.board) or []
        self.rows_panel.items = [dict(e, value=value(self.board, e)) for e in rows]
        self.none_box.visible = not rows
        for key, b in zip(BOARDS, [self.b_worth, self.b_level, self.b_turfs, self.b_missions]):
            on = key == self.board
            b.role = ["rk-tab", "on"] if on else ["rk-tab"]
            state.set_control_attr(b, "aria-pressed", "true" if on else "false")

    def _set(self, board):
        self.board = board
        router.replace("ranks", board)
        self._draw()

    @handle("b_worth", "click")
    def b_worth_click(self, **event_args):
        self._set("worth")

    @handle("b_level", "click")
    def b_level_click(self, **event_args):
        self._set("level")

    @handle("b_turfs", "click")
    def b_turfs_click(self, **event_args):
        self._set("turfs")

    @handle("b_missions", "click")
    def b_missions_click(self, **event_args):
        self._set("missions")

from anvil import *

from ._anvil_designer import PlayerRowTemplate
from ... import state


def money(n):
    n = int(round(n or 0))
    return ("-$" if n < 0 else "$") + "{:,}".format(abs(n))


class PlayerRow(PlayerRowTemplate):
    """Admin → Players: one game save with its progress, "Shown" on the leaderboard and "Reset name"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        self.demo.visible = bool(p.get("demo"))
        self.progress.text = "Lv %s · %s · %s missions · %s blocks · day %s" % (
            p.get("level"), money(p.get("worth")), p.get("missions"), p.get("turfs"), p.get("day"))
        self.when.text = state.ago(p.get("updated"))
        self.shown_box.checked = not p.get("hidden")

    @handle("shown_box", "change")
    def shown_box_change(self, **event_args):
        if state.call("admin_set_player", self.item["id"], not self.shown_box.checked, None) is not None:
            state.toast("Saved", "ok")
        else:
            self.shown_box.checked = not self.shown_box.checked

    @handle("rename_button", "click")
    def rename_button_click(self, **event_args):
        if confirm("Their game name on the leaderboard becomes \"Player\".", title="Reset this name?",
                   buttons=[("Cancel", False), ("Reset name", True)], role="app-dialog"):
            if state.call("admin_set_player", self.item["id"], None, True) is not None:
                state.toast("Name reset", "ok")
                self.name.text = "Player"

from anvil import *

from ._anvil_designer import QuestsTemplate
from ... import cft, router, state
from ...Dialogs.Mission import Mission

FILTERS = [("all", "All"), ("active", "Active"), ("open", "Available"), ("done", "Done"), ("locked", "Locked")]


class Quests(QuestsTemplate):
    """#quests/<all|active|open|done|locked>: every mission chapter by chapter with its status from your save. Tap one
    for the story, steps and reward (Dialogs/Mission); active ones can be tracked. Anyone can look; guests see their
    device's save."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        keys = [k for k, _ in FILTERS]
        self.filter = args[0] if args and args[0] in keys else "all"
        cft.prepare()
        self._draw()

    def _buttons(self):
        return {"all": self.f_all, "active": self.f_active, "open": self.f_open, "done": self.f_done, "locked": self.f_locked}

    def _draw(self):
        v = cft.view("quests", self.filter)
        self.lead.text = v["lead"]
        self.not_started.visible = not v["started"]
        for (key, text), b in zip(FILTERS, self._buttons().values()):
            b.text = "%s (%d)" % (text, v["counts"][key])
            on = key == self.filter
            b.role = ["qs-filter", "on"] if on else ["qs-filter"]
            state.set_control_attr(b, "aria-pressed", "true" if on else "false")
        self.chapters_panel.items = [dict(c, host=self) for c in v["chapters"]]
        self.none_box.visible = not v["chapters"]

    def _set(self, key):
        self.filter = key
        router.replace("quests", key)
        self._draw()

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set("all")

    @handle("f_active", "click")
    def f_active_click(self, **event_args):
        self._set("active")

    @handle("f_open", "click")
    def f_open_click(self, **event_args):
        self._set("open")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set("done")

    @handle("f_locked", "click")
    def f_locked_click(self, **event_args):
        self._set("locked")

    def open_mission(self, mission_id):
        """Called by Items/MissionCard."""
        v = cft.view("mission", mission_id)
        r = alert(Mission(view=v), buttons=[], role="app-dialog", dismissible=True)
        if r == "track" and cft.track(mission_id):
            state.toast('Tracking "%s"' % v["title"], "ok")
            self._draw()
        elif r == "play":
            router.go("play")

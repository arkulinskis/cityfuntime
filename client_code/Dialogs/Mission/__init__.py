from anvil import *

from ._anvil_designer import MissionTemplate
from ... import state


class Mission(MissionTemplate):
    """Quests: one mission's story, steps (done / now) and reward, or what unlocks it. Closes with "track", "play" or
    None. view = cft.view("mission", id)."""

    def __init__(self, view, **properties):
        super().__init__(**properties)
        v = view
        self.dom_nodes["e"].textContent = v.get("e") or ""
        self.title.text = v.get("title") or ""
        state.heading(self.title, 2)
        self.who.text = v.get("who") or ""
        locked = v.get("status") == "locked"
        self.locked_box.visible = locked
        self.story_box.visible = not locked
        self.reqs_panel.items = [{"text": r, "state": ""} for r in v.get("reqs") or []]
        self.quote.text = v.get("quote") or ""
        self.steps_panel.items = v.get("steps") or []
        self.rewards_panel.items = v.get("rewards") or []
        self.track_button.visible = bool(v.get("canTrack"))

    @handle("track_button", "click")
    def track_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="track")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("play_button", "click")
    def play_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="play")

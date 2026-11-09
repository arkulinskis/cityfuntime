from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

TABS = ["overview", "players", "maps", "feedback", "users", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, the old feedback inbox, users (admin / active switches) and the demo data.
    Each tab is its own address, so the browser's back button works."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        self._filter = "new"
        self._cities = []
        parts = {"overview": self.overview_part, "players": self.players_part, "maps": self.maps_part,
                 "feedback": self.feedback_part,
                 "users": self.users_part, "demo": self.demo_part}
        tabs = {"overview": self.tab_overview, "players": self.tab_players, "maps": self.tab_maps,
                "feedback": self.tab_feedback,
                "users": self.tab_users, "demo": self.tab_demo}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.feedback_panel.add_event_handler("x-changed", self._feedback_changed)
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = state.call("admin_overview")
        self.s_users.text, self.s_admins.text = str(d["users"]), str(d["admins"])
        self.s_admins_label.text = "admin" if d["admins"] == 1 else "admins"
        self.s_feedback.text, self.s_items.text = str(d["feedback_new"]), str(d["players"])
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (
            d["demo"]["state"], d["demo"]["counts"].get("users", 0))

    # ---- players (game saves: progress, leaderboard visibility, name reset)
    def _players(self, query=None):
        d = state.call("admin_players", query or None)
        if d is None:
            return
        self.players_panel.items = d["players"]
        self.players_count.text = state.plural(d["total"], "player")

    @handle("player_search", "pressed_enter")
    def player_search_pressed_enter(self, **event_args):
        self._players(self.player_search.text)

    @handle("player_search_button", "click")
    def player_search_button_click(self, **event_args):
        self._players(self.player_search.text)

    # ---- map backup (server_code/Tiles.py: the server's copy of street + hills tiles)
    def _maps(self):
        d = state.call("admin_tiles_status")
        if d is None:
            return
        self._cities = d["cities"]
        self.maps_status.text = "%s tiles kept · %s MB of %s MB allowed" % (d["tiles"], d["mb"], d["cap_mb"])
        self.cap_box.text = str(d["cap_mb"])
        self.cities_lead.text = ("Copy 1.2 km around each of these now, before anyone plays there (%d cities, about 3 MB "
                                 "each). You can leave this page open while it runs." % len(d["cities"]))
        self.cities.text = ", ".join(c["name"] for c in d["cities"])

    @handle("cap_button", "click")
    def cap_button_click(self, **event_args):
        if state.call("admin_tiles_cap", self.cap_box.text) is not None:
            state.toast("Saved", "ok")
            self._maps()

    @handle("seed_button", "click")
    def seed_button_click(self, **event_args):
        """Copies the starter cities a few tiles per call (each call returns where to carry on)."""
        self.seed_button.enabled = False
        added, i, nxt = 0, 0, 0
        try:
            while i < len(self._cities):
                r = state.call("admin_tiles_seed", i, nxt)
                if r is None:
                    return
                added += r["added"]
                self.seed_msg.text = "%s: %s / %s · %s new tiles" % (r["city"], min(r["next"], r["total"]), r["total"], added)
                if r.get("full"):
                    state.toast("The size limit is reached", "error")
                    break
                if r["done"]:
                    i, nxt = i + 1, 0
                else:
                    nxt = r["next"]
            else:
                state.toast("Starter cities copied (%d new tiles)" % added, "ok")
        finally:
            self.seed_button.enabled = True
        self._maps()

    # ---- feedback
    def _feedback(self):
        d = state.call("list_feedback", None)
        self._fb = d
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    def _feedback_changed(self, **event_args):
        self._feedback()

    # ---- users
    def _users(self, query=None):
        d = state.call("list_users", query or None)
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- demo data
    def _demo(self):
        d = state.call("admin_overview")["demo"]
        counts = ", ".join("%s %s" % (v, k) for k, v in d["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (d["state"], counts)
        self.demo_load_button.text = "Reload demo data" if d["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and content are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()

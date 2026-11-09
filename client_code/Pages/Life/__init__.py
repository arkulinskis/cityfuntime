from anvil import *

from ._anvil_designer import LifeTemplate
from ... import cft, state


class Life(LifeTemplate):
    """#life, the members' home page: a scrapbook of your character's life from the save (level, money, stats, home,
    love + family, friends, businesses, blocks, stickers, what you're doing now, the diary). No save yet: a welcome
    card that starts the game (and offers to keep a game played on this device before signing in)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        cft.prepare()
        v = cft.view("life")
        self.welcome_box.visible = v["welcome"]
        self.life_box.visible = not v["welcome"]
        if v["welcome"]:
            a = v.get("adopt")
            self.adopt_note.visible = bool(a)
            self.start_new.visible = not a
            self.start_keep.visible = bool(a)
            if a:
                self.adopt_note.text = ("We found a game you played on this device before signing in (%s, level %s). "
                                        "Press Play to keep it." % (a["name"], a["level"]))
            return
        self._draw(v)

    def _draw(self, v):
        self.initials.text = v["initials"]
        self.name_title.text = v["name"]
        state.heading(self.name_title, 1)
        self.sub.text = v["sub"]
        self.xp_bar.value = v["xp"]
        self.money.text = v["money"]
        self.worth.text = v["worth"]
        now = v["now"]
        self.dom_nodes["now_card"].className = "lf-card" + (" lf-now" if now["on"] else "")
        self.now_title.text = now["title"]
        self.now_text.text = now["text"]
        home = v["home"]
        self.dom_nodes["home_e"].textContent = home["e"]
        self.home_title.text = home["title"]
        self.home_label.text = home["label"]
        self.home_label.visible = bool(home["label"])
        self.home_note.text = home["note"]
        love = v["love"]
        self.love_title.text = love["title"]
        self.love_title.visible = bool(love["title"])
        self.love_sub.text = love["sub"]
        self.kids_panel.items = love["kids"]
        self.pets_panel.items = love["pets"]
        self.stats_panel.items = v["stats"]
        self.dom_nodes["friends_h"].textContent = "Friends (%d)" % len(v["friends"])
        self.friends_panel.items = v["friends"]
        self.friends_empty.visible = not v["friends"]
        self.dom_nodes["biz_h"].textContent = "Businesses (%d)" % len(v["biz"])
        self.biz_panel.items = v["biz"]
        self.biz_empty.visible = not v["biz"]
        self.turfs.text = v["turfs"]
        self.turfs_note.text = v["turfsNote"]
        self.stickers.text = v["stickers"]
        self.stickers_bar.value = v["stickersPct"]
        self.missions.text = v["missions"]
        self.diary_panel.items = v["diary"]
        self.diary_empty.visible = not v["diary"]
        self.saved.text = v["saved"]

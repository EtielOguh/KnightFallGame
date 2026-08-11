export class Terminal {
  constructor({ output, form, input }) {
    this.output = output;
    this.form = form;
    this.input = input;
    this.inputHandler = null;
    this.optionHandler = null;

    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = input.value.trim();
      input.value = "";
      if (value && this.inputHandler) this.inputHandler(value);
    });

    output.addEventListener("click", event => {
      const option = event.target.closest("[data-option]");
      if (option && this.optionHandler) this.optionHandler(option.dataset.option);
    });

    document.addEventListener("keydown", event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const options = [...this.output.querySelectorAll(".option")];
      if (!options.length) return;
      const current = options.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        options[(current + direction + options.length) % options.length].focus();
      } else if (event.key === "Enter" && current >= 0) {
        event.preventDefault();
        options[current].click();
      } else {
        const direct = options.find(option => option.dataset.option.toLocaleLowerCase("pt-BR") === event.key.toLocaleLowerCase("pt-BR"));
        if (direct) { event.preventDefault(); direct.click(); }
      }
    });
  }

  onInput(handler) { this.inputHandler = handler; }
  onOption(handler) { this.optionHandler = handler; }

  clear() { this.output.replaceChildren(); }

  print(text = "", style = "") {
    const line = document.createElement("div");
    line.className = `line ${style}`.trim();
    line.textContent = text;
    this.output.append(line);
    this.scrollToEnd();
  }

  option(key, label, style = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option ${style}`.trim();
    button.dataset.option = String(key);
    const shortcut = document.createElement("span");
    shortcut.className = "option-shortcut";
    shortcut.textContent = String(key).toLocaleUpperCase("pt-BR");
    const text = document.createElement("span");
    text.className = "option-label";
    text.textContent = label;
    button.append(shortcut, text);
    this.output.append(button);
  }

  separator(label = "") {
    this.print(label || "KNIGHTFALL", "title");
  }

  battlefield({ playerName, playerHp, playerMaxHp, enemyName, enemyHp, enemyMaxHp, actions = [] }) {
    const field = document.createElement("section");
    field.className = "battlefield";
    field.setAttribute("aria-label", `${playerName} enfrenta ${enemyName}`);

    const fighter = (name, hp, maxHp, art, side) => {
      const wrapper = document.createElement("div");
      wrapper.className = `fighter fighter-${side}`;
      const safePercent = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
      const nameLine = document.createElement("strong");
      nameLine.textContent = name;
      const health = document.createElement("div");
      health.className = "health-track";
      health.innerHTML = `<span style="width:${safePercent}%"></span>`;
      const value = document.createElement("small");
      value.textContent = `${hp}/${maxHp} HP`;
      const figure = document.createElement("pre");
      figure.className = "ascii-figure";
      figure.textContent = art;
      wrapper.append(nameLine, health, value, figure);
      return wrapper;
    };

    const actionDisplay = document.createElement("div");
    actionDisplay.className = "combat-action-display";
    if (actions.length) {
      actions.slice(-2).forEach(action => {
        const indicator = document.createElement("div");
        indicator.className = `attack-indicator attack-${action.type}`;
        indicator.textContent = action.label;
        actionDisplay.append(indicator);
      });
    } else {
      actionDisplay.textContent = "⚔";
    }

    field.append(
      fighter(playerName, playerHp, playerMaxHp, "  O>\n /|\\\n / \\", "player"),
      actionDisplay,
      fighter(enemyName, enemyHp, enemyMaxHp, "\\|/\n(ò_ó)\n/|\\", "enemy")
    );
    this.output.append(field);
    this.scrollToEnd();
  }

  scrollToEnd() { this.output.scrollTop = this.output.scrollHeight; }
  focus() { this.output.querySelector(".option")?.focus(); }
}

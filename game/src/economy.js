// Money between rounds: the economy that makes the buy menu matter. Kills pay,
// planting pays, winning pays more than losing, and the first round starts poor on
// purpose — a pistol round. Prices live in weapons.js; this module owns the wallet
// and the reward rules.
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 50;

export function createEconomy() {
  const state = { money: START_MONEY, armor: 0, kills: 0 };

  return {
    state,
    resetMatch() {
      state.money = START_MONEY;
      state.armor = 0;
      state.kills = 0;
    },
    canAfford(price) {
      return state.money >= price;
    },
    spend(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
    earn(amount) {
      state.money += amount;
    },
    onKill() {
      state.kills += 1;
      state.money += KILL_REWARD;
    },
    onPlant() {
      state.money += PLANT_REWARD;
    },
    onRoundEnd(won) {
      state.money += won ? WIN_REWARD : LOSS_REWARD;
    },
    buyArmor() {
      if (state.armor >= ARMOR_VALUE) return false;
      if (!this.spend(ARMOR_PRICE)) return false;
      state.armor = ARMOR_VALUE;
      return true;
    },
    // Armor soaks half of each hit until it is gone; returns the health damage.
    absorb(damage) {
      if (state.armor <= 0) return damage;
      const soaked = Math.min(state.armor, damage * 0.5);
      state.armor -= soaked;
      return damage - soaked;
    },
  };
}

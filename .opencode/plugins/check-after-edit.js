module.exports = function (ctx) {
  ctx.tool.hook("execute.after", async (args) => {
    console.log("Запуск автопроверки после изменения кода...");
    const result = await ctx.exec("sh scripts/check.sh");
    return result;
  });
};
function getWindowBounds(command, area) {
    const leftWidth = Math.floor(area.width / 2);
    const rightWidth = area.width - leftWidth;
    const topHeight = Math.floor(area.height / 2);
    const bottomHeight = area.height - topHeight;

    const bounds = {
        left: {
            x: area.x,
            y: area.y,
            width: leftWidth,
            height: area.height,
        },
        right: {
            x: area.x + leftWidth,
            y: area.y,
            width: rightWidth,
            height: area.height,
        },
        topRight: {
            x: area.x + leftWidth,
            y: area.y,
            width: rightWidth,
            height: topHeight,
        },
        bottomRight: {
            x: area.x + leftWidth,
            y: area.y + topHeight,
            width: rightWidth,
            height: bottomHeight,
        },
        maximize: { ...area },
    }[command];

    if (!bounds) throw new Error("Неизвестная команда окна");
    return bounds;
}

module.exports = { getWindowBounds };

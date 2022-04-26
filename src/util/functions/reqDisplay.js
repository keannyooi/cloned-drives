const action = {
    modelYear: arg => {
        let { start, end } = arg;
        if (start % 10 === 0 && end === start + 9) return `${start}s `;
        else return `${start} ~ ${end} `;
    },
    isPrize: isPrize => {
        if (isPrize === false) return "Non-Prize ";
        else return "";
    },
    make: make => {
        return `${make} `;
    },
    search: keyword => {
        return `${keyword} `;
    }
}
const order = ["modelYear", "country", "enginePos", "driveType", "gc", "seatCount", "fuelType", "tags", "isPrize", "make", "search"];

function reqDisplay(reqs) {
    let str = "";
    for (let criteria of order) {
        if (reqs[criteria] !== undefined) {
            str += action[criteria](reqs[criteria]);
        }
    }
    return str.slice(0, -1);
}

module.exports = reqDisplay;
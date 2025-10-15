const now = new Date();

let weight;

const options = {
  weekday: "long", // Tuesday
  year: undefined, // omit year
  month: "long", // September
  day: "numeric", // 30
  hour: "numeric", // 9
  minute: "2-digit", // 47
  hour12: true, // 12-hour format with AM/PM
};

const formattedDate = now.toLocaleString("en-US", options);
const date = document.getElementById("date");
date.innerHTML = `<b>${formattedDate}</b>`;

const func = async () => {
  const response = await window.versions.ping();
  console.log(response);
};

func();

const stepsDiv = document.getElementById("steps");
const distanceDiv = document.getElementById("distance");
const bmrDiv = document.getElementById("bmr");
const hevyActivity = document.getElementById("hevy");
let stravaActivity = document.getElementById("strava");
const weightDiv = document.getElementById("weight");

const init = async () => {
  // window.fitbitAPI.getFitbitWeight().then((data) => {
  const data = await window.fitbitAPI.getFitbitWeight();
  console.log(data);
  // console.log("weight data: ", data.weight);
  if (data == null) {
    weightDiv.innerText = "Need Auth";
  }
  if (!data && data != null) {
    weightDiv.innerText = `No Data found`;
  }
  if (data) {
    weight = data.weight[0]?.weight ? data.weight[0].weight : 80; // kg! which is good for our equations but need to convert to lbs when displayed
    weightDiv.innerText = (weight * 2.20462).toFixed(1);
  }

  if (!weight || data === null) {
    weight = 80; // 175 lb conversion set as default. although we don't really need this
    weightDiv.innerText = (weight * 2.20462).toFixed(1);
  }

  await loadFitbitData();
  await loadHevyActivity();
  await loadStravaActivity();
};

init();

let refreshButton = document.getElementById("refresh-btn");
refreshButton.addEventListener("click", () => {
  // Add spinning class
  refreshButton.classList.add("spinning");

  // Remove spinning class after animation completes
  setTimeout(() => {
    refreshButton.classList.remove("spinning");
  }, 600);

  init();
  console.log("refreshed");
});

// window.fitbitAPI.getFitbitDailyActivity().then((data) => {
const loadFitbitData = async () => {
  const data = await window.fitbitAPI.getFitbitDailyActivity();
  console.log("fitbit data", data);
  if (data === null) {
    stepsDiv.innerText = "No Auth";
    distanceDiv.innerText = "No Auth";
    bmrDiv.innerText = "No Auth";
    return;
  }
  let steps = data.summary.steps;
  let distance = data.summary.distances[0].distance; //  total distance
  let bmr = data.summary.caloriesBMR;
  if (steps !== null) {
    stepsDiv.innerText = steps;
  } else {
    stepsDiv.innerText = `Failed to load`;
  }

  if (distance !== null) {
    distanceDiv.innerText = distance.toFixed(2);
  } else {
    distanceDiv.innerText = `Failed to load`;
  }
  if (bmr !== null) {
    bmrDiv.innerText = bmr;
  } else {
    bmrDiv.innerText = `Failed to load`;
  }

  // const weeklyData = await window.fitbitAPI.getFitbitWeeklyActivity();
};

// window.fitbitAPI.getFitbitWeeklyActivity().then((data) => {
//   console.log(data);
// });

// window.stravaAPI.getStravaActivity().then((data) => {
const loadStravaActivity = async () => {
  const data = await window.stravaAPI.getStravaActivity();
  console.log(data);
  if (data === null) {
    stravaActivity.innerText = `No Strava Auth`;
    return;
  }
  // // let activity = data.at(-1);
  // let activity = data[0];

  //grab todays date only:
  // Suppose `data` is the array returned from Strava /athlete/activities
  const today = new Date();
  today.setHours(0, 0, 0, 0); // today midnight
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); // tomorrow midnight

  let activity = data.filter((act) => {
    // Only runs
    if (act.type !== "Run") return false;

    // Convert start_date to local Date
    const start = new Date(act.start_date);

    // Check if it’s today
    return start >= today && start < tomorrow;
  });
  console.log(activity);
  if (activity.length == 0) {
    stravaActivity.innerText = `Rest Day`;
    return;
  }
  if (!activity) {
    stravaActivity.innerText = `No Data Found`;
    return;
  }
  // for now let's just set activity to be the first we can change this to a list of activities later.
  activity = activity[0];
  console.log(activity.sport_type);
  let date = activity.start_date;
  let name = activity.sport_type;
  // convert meters to miles
  let distance = activity.distance / 1609.34;
  // convert meter / s to mph
  let mph = distance / (activity.moving_time / 3600); // Pace in min:sec per mile
  const paceMin = Math.floor(60 / mph);
  const paceSec = Math.round((60 / mph - paceMin) * 60);
  let totalTime = formatTime(activity.moving_time);
  let calories = 9.3 * weight * (activity.moving_time / 3600);
  console.log("weight", weight);

  if (isNaN(calories)) {
    calories = "N/A";
  } else {
    calories = calories.toFixed(0);
  }
  console.log("calories", calories);
  stravaActivity.innerText = `${name.toUpperCase()}
    ${new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric", hour12: true })}
    ${distance.toFixed(2)} mi
    ${paceMin}:${paceSec}/mi
    ${totalTime}
    ${calories} cal`;
};

// epoch to minutes, hours, second
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// window.hevyAPI.getHevyActivity().then((data) => {
const loadHevyActivity = async () => {
  const data = await window.hevyAPI.getHevyActivity();
  if (data == null) {
    hevyActivity.innerText = `No Hevy Auth`;
    return;
  }
  console.log(data);
  let workout = data.workouts;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  // const startOfYesterday = new Date(
  //   yesterday.getFullYear(),
  //   yesterday.getMonth(),
  //   yesterday.getDate(),
  // );
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday = start of week

  const workoutsToday = workout.filter(
    (w) => new Date(w.created_at) >= startOfToday,
  );
  // const workoutsThisWeek = workout.filter(
  //   (w) => new Date(w.created_at) >= startOfWeek,
  // );
  if (workoutsToday.length === 0) {
    hevyActivity.innerText = `Rest Day`;
    return;
  }
  if (!workoutsToday) {
    hevyActivity.innerText = `No Data Found`;
    return;
  }
  for (const w of workoutsToday) {
    const title = w.title;
    const date = new Date(w.created_at).toLocaleString();
    const elapsedTime = new Date(w.end_time) - new Date(w.start_time);
    console.log(elapsedTime);
    const durationStr = formatDuration(elapsedTime);
    const calories = (
      ((elapsedTime / 60000) * (4.5 * 3.5 * weight)) /
      200
    ).toFixed(0);
    hevyActivity.innerText += `
                             ${title}
                              ${date}
                              ${durationStr}
                              ${calories}
                              `;
  }
};

// ---------------MODAL---------------
const infoBtn = document.getElementById("info-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");

// Open modal
infoBtn.addEventListener("click", () => {
  modalOverlay.classList.add("active");
});

// Close modal on close button
modalClose.addEventListener("click", () => {
  modalOverlay.classList.remove("active");
});

// Close modal on overlay click
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.remove("active");
  }
});
const information = document.getElementById("app-info");
information.innerText = `This app is using chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`;

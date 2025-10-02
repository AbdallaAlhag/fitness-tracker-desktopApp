const information = document.getElementById("info");
information.innerText = `This app is using chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`;

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
date.innerHTML = `<b>Welcome! ${formattedDate}</b>`;

const func = async () => {
  const response = await window.versions.ping();
  console.log(response);
};

func();

const weightDiv = document.getElementById("weight");
window.fitbitAPI.getFitbitWeight().then((data) => {
  // console.log("weight data: ", data.weight);
  if (!data) {
    weightDiv.innerHTML = `<b>Today's weight:<\b> No Data found`;
  }
  weight = data.weight[0].weight; // kg! which is good for our equations but need to convert to lbs when displayed
  weightDiv.innerHTML = `<b>Today's weight:</b> ${(weight * 2.20462).toFixed(1)}`;
});

// grabs steps
const stepsDiv = document.getElementById("steps");
const distanceDiv = document.getElementById("distance");
const bmrDiv = document.getElementById("bmr");

window.fitbitAPI.getFitbitDailyActivity().then((data) => {
  let steps = data.summary.steps;
  let distance = data.summary.distances[0].distance; //  total distance
  let bmr = data.summary.caloriesBMR;
  if (steps !== null) {
    stepsDiv.innerHTML = `<b>Today's Steps:</b> ${steps}`;
  } else {
    stepsDiv.innerHTML = ` <b>Today's Steps:</b> Failed to load steps.`;
  }

  if (distance !== null) {
    distanceDiv.innerHTML = `<b>Today's distance:</b> ${distance.toFixed(2)} miles`;
  } else {
    distanceDiv.innerHTML = `<b>Today's distance:</b> Failed to load distance.`;
  }
  if (bmr !== null) {
    bmrDiv.innerHTML = `<b>Today's BMR:</b> ${bmr} cal`;
  } else {
    bmrDiv.innerHTML = `<b>Today's BMR:</b> Failed to load BMR.`;
  }
});

window.fitbitAPI.getFitbitWeeklyActivity().then((data) => {
  console.log(data);
});

let stravaActivity = document.getElementById("strava-activity");

window.stravaAPI.getStravaActivity().then((data) => {
  console.log(data);
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
    stravaActivity.innerHTML = `<b>Strava Activity</b>: 
                                No Cardio Today!`;
    return;
  }
  if (!activity) {
    stravaActivity.innerHTML = `<b>Strava Activity</b>: 
                                No Data Found!`;
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
  let calories = (9.3 * weight * (activity.moving_time / 3600)).toFixed(0);
  stravaActivity.innerText = `Strava Activity: ${name.toUpperCase()}
    Date: ${new Date(date).toLocaleString()}
    Distance: ${distance.toFixed(2)} mi
    Pace: ${paceMin}:${paceSec}/mi
    Time: ${totalTime}
    Calories: ${calories}`;
});

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
const hevyActivity = document.getElementById("hevy-activity");

window.hevyAPI.getHevyActivity().then((data) => {
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
    hevyActivity.innerHTML = `<b>Hevy Activity</b>:
                              No workout Today`;
    return;
  }
  if (!workoutsToday) {
    hevyActivity.innerHTML = `<b>Hevy Activity</b>:
                              No Data Found`;
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
                              Workout: ${title}
                              Date: ${date}
                              Duration: ${durationStr}
                              Calories: ${calories}
                              `;
  }
});

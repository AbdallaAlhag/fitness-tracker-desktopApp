const information = document.getElementById("info");
information.innerText = `This app is using chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`;

const now = new Date();

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
date.innerText = `Welcome! ${formattedDate}`;

const func = async () => {
  const response = await window.versions.ping();
  console.log(response);
};

func();

// grabs steps
const stepsDiv = document.getElementById("steps");
const distanceDiv = document.getElementById("distance");
const bmrDiv = document.getElementById("bmr");

window.fitbitAPI.getFitbitDailyActivity().then((data) => {
  let steps = data.summary.steps;
  let distance = data.summary.distances[0].distance; //  total distance
  let bmr = data.summary.caloriesBMR;
  if (steps !== null) {
    stepsDiv.innerText = `Today's Steps: ${steps}`;
  } else {
    stepsDiv.innerText = "Failed to load steps.";
  }

  if (distance !== null) {
    distanceDiv.innerText = `Today's distance: ${distance.toFixed(2)} miles`;
  } else {
    distanceDiv.innerText = "Failed to load distance.";
  }
  if (bmr !== null) {
    bmrDiv.innerText = `Today's BMR: ${bmr} cal`;
  } else {
    bmrDiv.innerText = "Failed to load BMR.";
  }
});

window.fitbitAPI.getFitbitWeeklyActivity().then((data) => {
  console.log(data);
});

let stravaActivity = document.getElementById("strava-activity");

window.stravaAPI.getStravaDailyActivity().then((data) => {
  // console.log(data);
  // // let activity = data.at(-1);
  // let activity = data[0];

  //grab todays date only:
  // Suppose `data` is the array returned from Strava /athlete/activities
  const today = new Date();
  today.setHours(0, 0, 0, 0); // today midnight
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); // tomorrow midnight

  const activity = data.filter((act) => {
    // Only runs
    if (act.type !== "Run") return false;

    // Convert start_date to local Date
    const start = new Date(act.start_date);

    // Check if it’s today
    return start >= today && start < tomorrow;
  });
  console.log(activity);
  if (activity.length == 0) {
    stravaActivity.innerText = `Strava Activity: 
                                No Cardio Today!`;
    return;
  }
  if (!activity) {
    stravaActivity.innerText = "No data found!";
    return;
  }
  let date = activity.start_date;
  let name = activity.sport_type;
  // convert meters to miles
  let distance = activity.distance / 1609.34;
  // convert meter / s to mph
  let mph = distance / (activity.moving_time / 3600); // Pace in min:sec per mile
  const paceMin = Math.floor(60 / mph);
  const paceSec = Math.round((60 / mph - paceMin) * 60);
  let totalTime = formatTime(activity.moving_time);

  stravaActivity.innerText = `Strava Activity: ${name.toUpperCase()}
Date: ${new Date(date).toLocaleString()}
Distance: ${distance.toFixed(2)} mi
Pace: ${paceMin}:${paceSec}/mi
Time: ${totalTime}`;
});

// epoch to minutes, hours, second
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

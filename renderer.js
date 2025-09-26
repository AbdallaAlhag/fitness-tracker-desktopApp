const information = document.getElementById("info");
information.innerText = `This app is using chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`;

const func = async () => {
  const response = await window.versions.ping();
  console.log(response);
};

func();

// grabs steps
const stepsDiv = document.getElementById("steps");
const distanceDiv = document.getElementById("distance");
const bmrDiv = document.getElementById("bmr");

window.fitbitAPI.getDailyActivity().then((data) => {
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

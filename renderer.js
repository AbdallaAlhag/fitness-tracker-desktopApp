const information = document.getElementById("info");
information.innerText = `This app is using chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`;

const func = async () => {
  const response = await window.versions.ping();
  console.log(response);
};

func();

// grabs steps
const stepsDiv = document.getElementById("steps");

window.fitbitAPI.getDailySteps().then((steps) => {
  if (steps !== null) {
    stepsDiv.innerText = `Today's Steps: ${steps}`;
  } else {
    stepsDiv.innerText = "Failed to load steps.";
  }
});

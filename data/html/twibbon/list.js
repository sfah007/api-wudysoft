const templates = [{
  html: ({
    avatar = "https://picsum.photos/seed/cyber/200/200",
    frame = "https://frame.cdn.twibbonize.com/f9051ff5-f637-496a-8e88-edca054a5f63.png"
  }) => `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twibbon 800x800</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #f0f0f0;
        }
        .twibbon {
            width: 800px;
            height: 800px;
            position: relative;
        }
        .twibbon img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        .avatar {
            object-fit: cover;
            z-index: 1;
        }
        .frame {
            object-fit: contain;
            z-index: 2;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="twibbon">
        <img class="avatar" src="${avatar}" alt="Avatar">
        <img class="frame" src="${frame}" alt="Frame">
    </div>
</body>
</html>`
}];
const getTemplate = ({
  template: index = 1,
  ...rest
}) => {
  let templateIndex = Number(index);
  if (isNaN(templateIndex) || templateIndex < 1 || templateIndex > templates.length) {
    templateIndex = 1;
  }
  return templates[templateIndex - 1].html({
    ...rest
  });
};
export default getTemplate;
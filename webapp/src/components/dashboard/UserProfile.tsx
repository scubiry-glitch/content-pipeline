import './Dashboard.css';

interface UserInterests {
  interests: Record<string, number>;
  topInterests: string[];
}

interface UserProfileProps {
  profile: UserInterests;
}

export function UserProfile({ profile }: UserProfileProps) {
  if (!profile || !profile.interests) {
    return <div className="alert-placeholder">暂无画像数据</div>;
  }

  const interestBars = Object.entries(profile.interests)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, weight]) => (
      <div key={topic} className="interest-bar">
        <span className="interest-topic">{topic}</span>
        <div className="interest-progress">
          <div
            className="interest-fill"
            style={{ width: `${weight * 100}%` }}
          ></div>
        </div>
        <span className="interest-value">{(weight * 100).toFixed(0)}%</span>
      </div>
    ));

  return (
    <div className="user-profile">
      <h4>兴趣画像</h4>
      {interestBars}
    </div>
  );
}

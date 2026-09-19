import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Users,
  GitBranch,
  Plus,
  Sparkles,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';
import { useAuth } from './auth';
import { Alert, Badge, Empty, Loading, PageTitle, useData } from './ui';
import { stages } from './types';
import type { DashboardData } from './types';
export function Dashboard() {
  const { user } = useAuth();
  const { data, error, reload } = useData<DashboardData>('/dashboard');
  return (
    <>
      <PageTitle
        eyebrow="YOUR HIRING, AT A GLANCE"
        title={`Good to see you, ${user.fullName.split(' ')[0]}.`}
        text="Great teams start with thoughtful conversations."
      >
        <Link className="primary" to="/vacancies?new=1">
          <Plus size={17} /> Create vacancy
        </Link>
      </PageTitle>
      <Alert message={error} />
      {error && (
        <button className="secondary" onClick={reload}>
          Try again
        </button>
      )}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="stats">
              {[
                {
                  title: 'Active vacancies',
                  value: data.vacancies,
                  icon: BriefcaseBusiness,
                  text: 'Opportunities open',
                  to: '/vacancies',
                },
                {
                  title: 'Your candidates',
                  value: data.candidates,
                  icon: Users,
                  text: 'People in your talent pool',
                  to: '/candidates',
                },
                {
                  title: 'Applications',
                  value: data.applications,
                  icon: GitBranch,
                  text: 'Across your hiring pipeline',
                  to: '/pipeline',
                },
              ].map((s) => (
                <Link to={s.to} className="stat" key={s.title}>
                  <div>
                    <span>{s.title}</span>
                    <s.icon size={18} />
                  </div>
                  <strong>{s.value.toString().padStart(2, '0')}</strong>
                  <footer>
                    {s.text}
                    <ArrowUpRight size={16} />
                  </footer>
                </Link>
              ))}
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Hiring pipeline</h2>
                    <p>Every application, a clear next step.</p>
                  </div>
                  <Link to="/pipeline" className="text-link">
                    View pipeline <ArrowRight size={15} />
                  </Link>
                </div>
                <div className="pipeline-chart">
                  {stages.map((stage) => {
                    const count = data.stages.find((s) => s.status === stage)?._count || 0;
                    return (
                      <div className="chart-column" key={stage}>
                        <strong>{count}</strong>
                        <div className="bar-track">
                          <div
                            className={`bar ${stage.toLowerCase()}`}
                            style={{
                              height: `${count ? Math.max(12, (count / Math.max(1, ...data.stages.map((s) => s._count))) * 100) : 3}%`,
                            }}
                          />
                        </div>
                        <span>{stage.toLowerCase()}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="panel-foot">
                  <span className="live-dot" /> Pipeline stages are updated by your team.
                </div>
              </section>
              <section className="insight-card">
                <span className="ai-icon">
                  <Sparkles size={22} />
                </span>
                <span className="eyebrow">A SECOND SET OF EYES</span>
                <h2>
                  Less guesswork.
                  <br />
                  Better conversations.
                </h2>
                <p>
                  Turn CVs into structured evidence and focused interview questions. You stay in
                  control of every decision.
                </p>
                <Link to="/candidates">
                  Review your candidates <ArrowRight size={16} />
                </Link>
                <div className="insight-decoration">
                  <FileCheck2 size={66} />
                  <span>Evidence, not assumptions.</span>
                </div>
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent applications</h2>
                  <p>The latest movement in your workspace.</p>
                </div>
                <Link className="text-link" to="/pipeline">
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              {data.recent.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Vacancy</th>
                        <th>Stage</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <Link className="person" to={`/applications/${a.id}`}>
                              <span className="avatar">
                                {a.candidate.fullName.slice(0, 2).toUpperCase()}
                              </span>
                              {a.candidate.fullName}
                            </Link>
                          </td>
                          <td>{a.vacancy.title}</td>
                          <td>
                            <Badge value={a.status} />
                          </td>
                          <td>
                            <Link
                              aria-label={`Review ${a.candidate.fullName}`}
                              to={`/applications/${a.id}`}
                            >
                              <ArrowUpRight size={17} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your next great hire starts here"
                  text="Create a vacancy, add a candidate, and connect them with an application."
                >
                  <Link className="secondary" to="/candidates">
                    Add your first candidate <ArrowRight size={16} />
                  </Link>
                </Empty>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}

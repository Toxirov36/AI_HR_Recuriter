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
import { useAuth } from '../../features/auth';
import {
  Alert,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Empty,
  Loading,
  PageTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useData,
} from '../../components/ui';
import { stages } from '../../types';
import type { DashboardData } from '../../types';

export function Dashboard() {
  const { user } = useAuth();
  const { data, error, reload } = useData<DashboardData>('/dashboard');
  return (
    <>
      <PageTitle
        eyebrow={`GOOD TO SEE YOU, ${user.fullName.split(' ')[0].toUpperCase()}`}
        title="Recruiting overview"
        text="Everything waiting for a human decision, in one place."
      >
        <Link className="primary" to="/vacancies?new=1">
          <Plus size={17} /> Create vacancy
        </Link>
      </PageTitle>
      <Alert message={error} />
      {error && (
        <Button variant="outline" className="mt-3" onClick={reload}>
          Try again
        </Button>
      )}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="stats stats-four">
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
                {
                  title: 'Hired',
                  value: data.stages.find((stage) => stage.status === 'HIRED')?._count || 0,
                  icon: FileCheck2,
                  text: 'Confirmed by your team',
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
              <section className="panel quick-actions-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Quick actions</h2>
                    <p>Continue the work that needs attention.</p>
                  </div>
                </div>
                <div className="quick-actions-list">
                  {[
                    {
                      to: '/vacancies?new=1',
                      icon: Sparkles,
                      title: 'Draft a job description',
                      text: 'AI prepares, you approve',
                    },
                    {
                      to: '/candidates',
                      icon: Users,
                      title: 'Review candidates',
                      text: 'CV structure and profiles',
                    },
                    {
                      to: '/pipeline',
                      icon: GitBranch,
                      title: 'Open hiring pipeline',
                      text: 'Confirm every stage change',
                    },
                  ].map((action) => (
                    <Link key={action.title} to={action.to}>
                      <span>
                        <action.icon size={17} />
                      </span>
                      <div>
                        <strong>{action.title}</strong>
                        <small>{action.text}</small>
                      </div>
                      <ArrowRight size={15} />
                    </Link>
                  ))}
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Vacancy</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Link
                              className="person inline-flex items-center gap-2.5 font-medium"
                              to={`/applications/${a.id}`}
                            >
                              <Avatar className="h-7 w-7 text-xs">
                                <AvatarFallback className="bg-[#1b4338] text-white font-semibold text-[11px]">
                                  {a.candidate.fullName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {a.candidate.fullName}
                            </Link>
                          </TableCell>
                          <TableCell>{a.vacancy.title}</TableCell>
                          <TableCell>
                            <Badge value={a.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              className="inline-flex items-center justify-center p-1.5 rounded hover:bg-muted"
                              aria-label={`Review ${a.candidate.fullName}`}
                              to={`/applications/${a.id}`}
                            >
                              <ArrowUpRight size={17} />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
